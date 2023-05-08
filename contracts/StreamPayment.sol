// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StreamPayment {

    uint256 totalStreams = 0;
    mapping (uint => Stream) streams;  // key is streamID

    struct Stream {
        string  title;
        address payer;
        address receiver;
        address tokenAddress;
        uint256 totalAmount;
        uint256 claimedAmount;  // remainedAmount = totalAmount - claimedAmount
        uint256 startTime;
        uint256 endTime;
        uint256 streamID;
    }

    function isValidERC20Token(address tokenAddress) public view returns (bool) {
        uint256 size;
        assembly { size := extcodesize(tokenAddress) }              // wheter token address has contract code
        return size > 0 && IERC20(tokenAddress).totalSupply() > 0;  // wheter token address implement IERC20 interface
    }

    function createStream(string  title,
                          address payer,
                          address receiver,
                          address tokenAddress,        // currently support ERC20 token
                          uint256 totalAmount,
                          uint256 startTime,
                          uint256 endTime) external returns (uint256) {
        
        // uint: second refer to "block.timestamp"
        require(startTime > block.timestamp, "Start time is in the past");
        require(endTime > block.timestamp, "End time is in the past");
        require(endTime > startTime, "End time need to be later than start time");
        
        require(payer != address(0), "Invalid payer address");
        require(receiver != address(0), "Invalid receiver address");
        require(payer != receiver, "Payer can not be the same as receiver");

        require(totalAmount > 0, "Transfer amount of the token needs to be greater than zero");

        // valid ERC20 token
        require(isValidERC20Token(tokenAddress) == true, "Token address is not a valid ERC20 token");

        //  transfer token from the payer's address to this contract
        //   1. check if the remain amount is enough
        IERC20 token = IERC20(tokenAddress);
        require(token.balanceOf(payer) >= totalAmount, "The payer's token amount is not enough to create the stream");
        //   2. transfer total amount to this contract's address <need payer's approval first>
        token.transferFrom(payer, address(this), totalAmount);

        // stream
        Stream memory stream;  // memory: temporary usage
        stream.title    = title;
        stream.payer    = payer;
        stream.receiver = receiver;
        stream.tokenAddress    = tokenAddress;
        stream.totalAmount      = totalAmount;
        stream.claimedAmount    = 0;
        stream.startTime        = startTime;
        stream.endTime          = endTime;
        stream.streamID         = totalStreams;
        totalStreams++;

        streams[stream.streamID] = stream;

        return stream.streamID;
    }

    function claimPayment(uint256 streamID, uint256 _claimAmount) external {
        require(streams[streamID].receiver == msg.sender, "This streamID's receiver is not you, you cannot claim the asset");

        // the amount able to claim - the amount already claimed
        uint256 validClaimAmount = streams[streamID].totalAmount * ((block.timestamp - streams[streamID].startTime) / (streams[streamID].endTime - streams[streamID].startTime));
        validClaimAmount -= streams[streamID].claimedAmount;
        require(_claimAmount <= validClaimAmount, "_claimAmount larger than validClaimAmount");

        // transfer from this contract to the msg.sender
        IERC20(streams[streamID].tokenAddress).transferFrom(address(this), msg.sender, _claimAmount);
        streams[streamID].claimedAmount += _claimAmount;
    }

    function getPayerStreamInfo() view external returns (Stream[] memory) {
        Stream[] memory streamsInfo;
        for(uint i = 0; i < totalStreams; i++) {
            if(streams[i].payer == msg.sender) {
                streamsInfo.push(streams[i]);
            }
        }
        return streamsInfo;
    }

    // try gas report
    // return all info of the payment filter by state to show in the frontend
    // query the info with streamID, access control just to higher the difficulty of one to see the info of others
    function getReceiverStreamInfo() view external returns (Stream[] memory) {
        Stream[] memory streamsInfo;
        for(uint i = 0; i < totalStreams; i++) {
            if(streams[i].receiver == msg.sender) {
                streamsInfo.push(streams[i]);
            }
        }
        return streamsInfo;
    }
}