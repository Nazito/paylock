// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Paylock
/// @notice Native-token invoice escrow. Funds move only if the payer
///         confirms the exact payee and amount. A mismatch does not send.
contract Paylock {
    enum Status {
        None,
        Created,
        Funded,
        Released,
        Refunded
    }

    struct Invoice {
        address payer;
        address payee;
        uint256 amount;
        bytes32 memo;
        Status status;
    }

    uint256 public nextId = 1;
    mapping(uint256 => Invoice) public invoices;

    error ZeroPayee();
    error ZeroAmount();
    error NotFound();
    error NotPayer();
    error WrongStatus(Status got);
    error WrongValue();
    error PayeeMismatch(address expected, address got);
    error AmountMismatch(uint256 expected, uint256 got);
    error AlreadySettled();
    error TransferFailed();

    event Created(uint256 indexed id, address indexed payer, address indexed payee, uint256 amount, bytes32 memo);
    event Funded(uint256 indexed id, uint256 amount);
    event Held(uint256 indexed id, bytes32 reason);
    event Released(uint256 indexed id, address indexed payee, uint256 amount);
    event Refunded(uint256 indexed id, address indexed payer, uint256 amount);

    function create(address payee, uint256 amount, bytes32 memo) external returns (uint256 id) {
        if (payee == address(0)) revert ZeroPayee();
        if (amount == 0) revert ZeroAmount();
        id = _open(msg.sender, payee, amount, memo, Status.Created);
    }

    function fund(uint256 id) external payable {
        Invoice storage inv = invoices[id];
        if (inv.status == Status.None) revert NotFound();
        if (msg.sender != inv.payer) revert NotPayer();
        if (inv.status != Status.Created) revert WrongStatus(inv.status);
        if (msg.value != inv.amount) revert WrongValue();
        inv.status = Status.Funded;
        emit Funded(id, msg.value);
    }

    /// Create and fund in one step. Amount is msg.value.
    function lock(address payee, bytes32 memo) external payable returns (uint256 id) {
        if (payee == address(0)) revert ZeroPayee();
        if (msg.value == 0) revert ZeroAmount();
        id = _open(msg.sender, payee, msg.value, memo, Status.Funded);
        emit Funded(id, msg.value);
    }

    /// Confirm exact payee + amount. Mismatch reverts and does not move funds.
    function release(uint256 id, address expectedPayee, uint256 expectedAmount) external {
        Invoice storage inv = invoices[id];
        if (inv.status == Status.None) revert NotFound();
        if (msg.sender != inv.payer) revert NotPayer();
        if (inv.status == Status.Released || inv.status == Status.Refunded) revert AlreadySettled();
        if (inv.status != Status.Funded) revert WrongStatus(inv.status);

        if (expectedPayee != inv.payee) {
            emit Held(id, "payee_mismatch");
            revert PayeeMismatch(inv.payee, expectedPayee);
        }
        if (expectedAmount != inv.amount) {
            emit Held(id, "amount_mismatch");
            revert AmountMismatch(inv.amount, expectedAmount);
        }

        inv.status = Status.Released;
        (bool ok,) = inv.payee.call{value: inv.amount}("");
        if (!ok) revert TransferFailed();
        emit Released(id, inv.payee, inv.amount);
    }

    function refund(uint256 id) external {
        Invoice storage inv = invoices[id];
        if (inv.status == Status.None) revert NotFound();
        if (msg.sender != inv.payer) revert NotPayer();
        if (inv.status == Status.Released || inv.status == Status.Refunded) revert AlreadySettled();
        if (inv.status != Status.Funded) revert WrongStatus(inv.status);
        inv.status = Status.Refunded;
        (bool ok,) = inv.payer.call{value: inv.amount}("");
        if (!ok) revert TransferFailed();
        emit Refunded(id, inv.payer, inv.amount);
    }

    function get(uint256 id) external view returns (Invoice memory) {
        return invoices[id];
    }

    function _open(address payer, address payee, uint256 amount, bytes32 memo, Status status)
        internal
        returns (uint256 id)
    {
        id = nextId++;
        invoices[id] = Invoice({payer: payer, payee: payee, amount: amount, memo: memo, status: status});
        emit Created(id, payer, payee, amount, memo);
    }
}
