// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

struct Stream {
    string  title;
    address payer;
    address receiver;
    address tokenAddress;
    uint256 totalAmount;
    uint256 claimedAmount;  // remainedAmount = totalAmount - claimedAmount - penaltyAmount
    uint256 partialAmountAbleToClaim;
    uint256 validClaimAmount;
    uint256 startTime;
    uint256 endTime;
    uint256 streamID;
    bool    terminatedHalfway;
}

struct Penalty {
    uint256 startTime;
    uint256 endTime;
    string status;
}


contract StreamPayment {
    event createStreamEvent(address, address, uint256);
    event claimPaymentEvent(uint256, uint256);
    event terminatePaymentEvent(uint256);

    uint256 totalStreams = 0;
    mapping (uint => Stream) public streams;  // key is streamID
    mapping (uint256 => mapping(uint256 => Penalty)) public penalties; // key is [streamID][penaltyID]
    mapping (uint256 => uint256) public penaltyLength; // key is streamID
    mapping (uint256 => uint256) public totalPenaltyAmount; // key is streamID
    mapping (uint256 => mapping(uint256 => uint256)) public penaltyAmount; // key is streamID

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
                          uint256 endTime) external  {
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
        uint256 streamID = totalStreams;
        totalStreams++;

        streams[streamID].title      = title;
        streams[streamID].payer      = payer;
        streams[streamID].receiver   = receiver;
        streams[streamID].tokenAddress = tokenAddress;
        streams[streamID].totalAmount    = totalAmount;
        streams[streamID].claimedAmount  = 0;
        streams[streamID].partialAmountAbleToClaim = 0;
        streams[streamID].validClaimAmount = 0;
        streams[streamID].startTime = startTime;
        streams[streamID].endTime = endTime;
        streams[streamID].streamID = streamID;
        streams[streamID].terminatedHalfway = false;

        penaltyLength[streamID] = 0;
        totalPenaltyAmount[streamID] = 0;

        emit createStreamEvent(payer, receiver, streamID);  // may extent the content in the future, other variables can be filtered by streams
    }

    /// @notice This function is for the payer of the stream to add penalty to the stream, in case that the receiver not obligate their duty.
    /// @param streamID The id of the stream
    /// @param startTime The startTime of the penalty
    /// @param endTime The endTime of the penalty
    function addPenalty(uint256 streamID, uint256 startTime, uint256 endTime) external {
        require(streamID < totalStreams, "Invalid streamID");
        require(msg.sender == streams[streamID].payer, "Only payer of the stream can raise penalty");
        require(startTime >= streams[streamID].startTime, "Start time should be later than stream's own start time");
        require(endTime <= streams[streamID].endTime, "End time should be earlier than stream's own end time");
        require(endTime > startTime, "End time should be later than start time");

        totalPenaltyAmount[streamID] += (endTime - startTime) * streams[streamID].totalAmount / (streams[streamID].endTime - streams[streamID].startTime);
        penaltyAmount[streamID][penaltyLength[streamID]] = (endTime - startTime) * streams[streamID].totalAmount / (streams[streamID].endTime - streams[streamID].startTime);

        Penalty memory item;
        item.startTime = startTime;
        item.endTime = endTime;
        item.status = "Unknown";

        penalties[streamID][penaltyLength[streamID]] = item;
        penaltyLength[streamID]++;
    }

    /// @notice This function is for the receiver of the stream to admit the penalty.
    /// @param streamID The id of the stream
    /// @param penaltyID The id of the penalty in that stream
    function admitPenalty(uint256 streamID, uint256 penaltyID) external {
        require(streamID < totalStreams, "Invalid streamID");
        require(penaltyID < penaltyLength[streamID], "Invalid penalty ID");
        require(msg.sender == streams[streamID].receiver, "Only receiver of the stream can admit penalty");
        penalties[streamID][penaltyID].status = "Admit";
    }

    /// @notice This function is for the receiver of the stream to deny the penalty.
    /// @param streamID The id of the stream
    /// @param penaltyID The id of the penalty in that stream
    function denyPenalty(uint256 streamID, uint256 penaltyID) external {
        require(streamID < totalStreams, "Invalid streamID");
        require(penaltyID < penaltyLength[streamID], "Invalid penalty ID");
        require(msg.sender == streams[streamID].receiver, "Only receiver of the stream can admit penalty");
        penalties[streamID][penaltyID].status = "Dispute";
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

        streams[streamID].validClaimAmount = streams[streamID].partialAmountAbleToClaim - streams[streamID].claimedAmount - totalPenaltyAmount[streamID];
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