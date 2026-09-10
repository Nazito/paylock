// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Paylock} from "../src/Paylock.sol";

contract PaylockTest is Test {
    Paylock internal lock;
    address internal payer = address(0xA11CE);
    address internal payee = address(0xB0B);
    address internal attacker = address(0xBAD);

    function setUp() public {
        lock = new Paylock();
        vm.deal(payer, 100 ether);
    }

    function test_lockThenRelease() public {
        vm.prank(payer);
        uint256 id = lock.lock{value: 1 ether}(payee, bytes32("inv-1"));

        uint256 beforeBal = payee.balance;
        vm.prank(payer);
        lock.release(id, payee, 1 ether);
        assertEq(payee.balance, beforeBal + 1 ether);

        Paylock.Invoice memory inv = lock.get(id);
        assertEq(uint256(inv.status), uint256(Paylock.Status.Released));
    }

    function test_payeeMismatchDoesNotSend() public {
        vm.prank(payer);
        uint256 id = lock.lock{value: 2 ether}(payee, bytes32("inv-2"));

        uint256 payeeBefore = payee.balance;
        uint256 attackerBefore = attacker.balance;
        uint256 contractBefore = address(lock).balance;

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Paylock.PayeeMismatch.selector, payee, attacker));
        lock.release(id, attacker, 2 ether);

        assertEq(payee.balance, payeeBefore);
        assertEq(attacker.balance, attackerBefore);
        assertEq(address(lock).balance, contractBefore);

        Paylock.Invoice memory inv = lock.get(id);
        assertEq(uint256(inv.status), uint256(Paylock.Status.Funded));
    }

    function test_alreadySettled() public {
        vm.prank(payer);
        uint256 id = lock.lock{value: 1 ether}(payee, 0);
        vm.prank(payer);
        lock.release(id, payee, 1 ether);

        vm.prank(payer);
        vm.expectRevert(Paylock.AlreadySettled.selector);
        lock.release(id, payee, 1 ether);
    }

    function test_amountMismatchDoesNotSend() public {
        vm.prank(payer);
        uint256 id = lock.lock{value: 1 ether}(payee, 0);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Paylock.AmountMismatch.selector, 1 ether, 2 ether));
        lock.release(id, payee, 2 ether);
        assertEq(address(lock).balance, 1 ether);
    }

    function test_refund() public {
        vm.prank(payer);
        uint256 id = lock.lock{value: 3 ether}(payee, 0);
        uint256 before = payer.balance;
        vm.prank(payer);
        lock.refund(id);
        assertEq(payer.balance, before + 3 ether);
    }

    function test_strangerCannotRelease() public {
        vm.prank(payer);
        uint256 id = lock.lock{value: 1 ether}(payee, 0);
        vm.prank(attacker);
        vm.expectRevert(Paylock.NotPayer.selector);
        lock.release(id, payee, 1 ether);
    }
}
