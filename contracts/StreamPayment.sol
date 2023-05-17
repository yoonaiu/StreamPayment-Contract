// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

contract StreamPayment {
    event createStreamEvent(address, address, uint256);
    event claimPaymentEvent(uint256, uint256);
    event terminatePaymentEvent(uint256);

    uint256 totalStreams = 0;
    mapping (uint => Stream) public streams;  // key is streamID

    struct Stream {
        string  title;
        address payer;
        address receiver;
        address tokenAddress;
        uint256 totalAmount;
        uint256 claimedAmount;  // remainedAmount = totalAmount - claimedAmount
        uint256 partialAmountAbleToClaim;
        uint256 validClaimAmount;
        uint256 startTime;
        uint256 endTime;
        uint256 streamID;
        bool    terminatedHalfway;
    }

    function isValidERC20Token(address tokenAddress) public view returns (bool) {
        uint256 size;
        assembly { size := extcodesize(tokenAddress) }              // wheter token address has contract code
        return size > 0 && IERC20(tokenAddress).totalSupply() > 0;  // wheter token address implement IERC20 interface
    }

    function createStream(string  memory title,
                          address payer,
                          address receiver,
                          address tokenAddress,        // currently support ERC20 token
                          uint256 totalAmount,
                          uint256 startTime,
                          uint256 endTime) external returns (uint256) {
        // uint: second refer to "block.timestamp"
        require(startTime > block.timestamp, "Start time is in the past");
        require(endTime > block.timestamp, "End time is in the past");
        require(endTime > startTime, "End time should be later than start time");
        
        require(payer != address(0), "payer address should not be zero address");
        require(receiver != address(0), "receiver address should not be zero address");
        require(payer != receiver, "Payer should not be the same as receiver");

        require(totalAmount > 0, "Transfer amount of the token should be greater than zero");

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
        stream.partialAmountAbleToClaim = 0;
        stream.validClaimAmount    = 0;
        stream.startTime        = startTime;
        stream.endTime          = endTime;
        stream.streamID         = totalStreams;
        stream.terminatedHalfway       = false;
        totalStreams++;

        streams[stream.streamID] = stream;

        emit createStreamEvent(payer, receiver, stream.streamID);  // may extent the content in the future, other variables can be filtered by streams

        return stream.streamID;
    }

    function _countClaimAmount(uint256 streamID, uint256 blockTimestamp) internal {
        require(streamID < totalStreams, "Invalid streamID");  // 0 <= streamID will be banned by solidity(uint256)

        if(streams[streamID].terminatedHalfway == false) {  // can count a new one, if '_countClaimAmount', use the original one
            if(blockTimestamp >= streams[streamID].endTime) {
                streams[streamID].partialAmountAbleToClaim = streams[streamID].totalAmount;
            } else {
                streams[streamID].partialAmountAbleToClaim = (streams[streamID].totalAmount * (blockTimestamp - streams[streamID].startTime)) / (streams[streamID].endTime - streams[streamID].startTime);
            }
        }

        streams[streamID].validClaimAmount = streams[streamID].partialAmountAbleToClaim - streams[streamID].claimedAmount;
    }

    // call this function to check the valid amount able to claim before calling claimPayment
    function countValidClaimAmount(uint256 streamID) external {
        require(streamID < totalStreams, "Invalid streamID");
        require(streams[streamID].receiver == msg.sender, "This streamID's receiver is not you, you cannot count the claim asset");

        uint256 blockTimestamp = block.timestamp;
        require(blockTimestamp > streams[streamID].startTime, "The payment not yet start, you cannot count the claim asset");

        _countClaimAmount(streamID, blockTimestamp);
    }

    function claimPayment(uint256 streamID, uint256 claimAmount) external {
        require(streamID < totalStreams, "Invalid streamID");
        require(streams[streamID].receiver == msg.sender, "This streamID's receiver is not you, you cannot claim the asset");
        
        uint256 blockTimestamp = block.timestamp;
        require(blockTimestamp > streams[streamID].startTime, "The payment not yet start, you cannot claim it");

        _countClaimAmount(streamID, blockTimestamp);

        require(claimAmount <= streams[streamID].validClaimAmount, "claimAmount larger than validClaimAmount");

        // transfer from this contract to the streams[streamID].receiver
        IERC20(streams[streamID].tokenAddress).transfer(streams[streamID].receiver, claimAmount);  // transferFrom function need approval of contract address
        streams[streamID].claimedAmount += claimAmount;

        emit claimPaymentEvent(streamID, claimAmount);
    }

    function terminatePayment(uint256 streamID) external {
        require(streamID < totalStreams, "Invalid streamID");
        require(streams[streamID].payer == msg.sender, "This streamID's payer is not you, you cannot terminate the payment");
        require(streams[streamID].terminatedHalfway == false, "Cannot terminate twice");
        
        uint256 blockTimestamp = block.timestamp;
        require(blockTimestamp > streams[streamID].startTime, "The payment not yet start, you cannot terminate it");
        require(blockTimestamp < streams[streamID].endTime, "The payment has already done, you cannot terminate it");

        // count the last claim amount by timestamp and fix partialAmountAbleToClaim by terminatedHalfway = true here
        _countClaimAmount(streamID, blockTimestamp);
        streams[streamID].terminatedHalfway = true;

        emit terminatePaymentEvent(streamID);
    } 

    function getPayerStreamInfo() view external returns (Stream[] memory) {
        uint cnt = 0;
        for(uint i = 0; i < totalStreams; i++) {
            if(streams[i].payer == msg.sender) {
                cnt++;
            }
        }

        Stream[] memory streamsInfo = new Stream[](cnt);
        cnt = 0;
        for(uint i = 0; i < totalStreams; i++) {
            if(streams[i].payer == msg.sender) {
                streamsInfo[cnt] = streams[i];
                cnt++;
            }
        }
        return streamsInfo;
    }

    // try gas report
    // return all info of the payment filter by state to show in the frontend
    // query the info with streamID, access control just to higher the difficulty of one to see the info of others
    function getReceiverStreamInfo() view external returns (Stream[] memory) {
        uint cnt = 0;
        for(uint i = 0; i < totalStreams; i++) {
            if(streams[i].receiver == msg.sender) {
                cnt++;
            }
        }

        Stream[] memory streamsInfo = new Stream[](cnt);
        cnt = 0;
        for(uint i = 0; i < totalStreams; i++) {
            if(streams[i].receiver == msg.sender) {
                streamsInfo[cnt] = streams[i];
                cnt++;
            }
        }
        return streamsInfo;
    }
}