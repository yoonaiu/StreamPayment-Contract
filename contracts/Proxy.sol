// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.17;

contract Proxy {
    // Use unstructured storage to store “owner” and “logic”.
    // logicPosition: the deployed contract's address
    bytes32 private constant ownerPosition =
        keccak256("org.zeppelinos.proxy.owner");
    bytes32 private constant logicPosition =
        keccak256("org.zeppelinos.proxy.logic");

    event UpgradeLogic(address indexed logic);

    // (0) Owner of the proxy and the owner of the new contract(the storage slot is in the proxy context)
    //     need both to be the msg.sender of the deploySafeProxy
    //     The owner of the proxy will only be set once here
    constructor(
        address logic,
        address proxyOwner
    ) {
        bytes32 _logicPosition = logicPosition;
        bytes32 _ownerPosition = ownerPosition;
        assembly {
            sstore(_logicPosition, logic)
            sstore(_ownerPosition, proxyOwner)
        }
    }

    // (1) Forward any calls to the logic contract via delegatecall.
    fallback(
        bytes calldata callData
    ) external returns (bytes memory returnData) {
        returnData = _forwardCall(callData);
    }

    // (2) Delegatecall
    function _forwardCall(
        bytes memory callData
    ) private returns (bytes memory returnData) {
        address logic = getLogic();
        (bool s, bytes memory r) = logic.delegatecall(callData);
        if (!s)
            assembly {
                revert(add(r, 0x20), mload(r))
            }
        return r;
    }

    // (3) Initializes the proxy so that the message sender is the owner of the new Safe.
    //     only the owner can change the logic
    function changeLogic(address newLogic) external {
        address owner = getProxyOwner();
        require(
            owner == msg.sender,
            "Only the owner of this contract can change the logic that Proxy points to!"
        );

        // pass the check -> change to new logic
        bytes32 _logicPosition = logicPosition;
        assembly {
            sstore(_logicPosition, newLogic)
        }

        emit UpgradeLogic(newLogic);
    }

    // (4) getProxyOwner by loading info from the ownerPosition (unstructured storage)
    //     Useful for both internal and external
    function getProxyOwner() public view returns (address owner) {
        bytes32 _ownerPosition = ownerPosition;
        assembly {
            owner := sload(_ownerPosition)
        }
    }

    // (5) getLogic by loading info from the logicPosition (unstructured storage)
    //     Useful for both internal and external
    function getLogic() public view returns (address logic) {
        bytes32 _logicPosition = logicPosition;
        assembly {
            logic := sload(_logicPosition)
        }
    }
}
