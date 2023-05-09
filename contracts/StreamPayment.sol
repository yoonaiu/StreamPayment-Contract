// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

contract StreamPayment {
    event StreamCreated(address, uint256);

    uint256 totalStreams = 0;
    mapping (uint => Stream) public streams;  // key is streamID

    struct Stream {
        string  title;
        address payer;
        address receiver;
        address tokenAddress;
        uint256 totalAmount;
        uint256 claimedAmount;  // remainedAmount = totalAmount - claimedAmount
        uint256 validClaimAmount;
        uint256 startTime;
        uint256 endTime;
        uint256 streamID;
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
        console.log("block.timestamp: ", block.timestamp);
        console.log("startTime: ", startTime);
        console.log("endTime: ", endTime);
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
        stream.validClaimAmount = 0;
        stream.startTime        = startTime;
        stream.endTime          = endTime;
        stream.streamID         = totalStreams;
        totalStreams++;

        streams[stream.streamID] = stream;

        emit StreamCreated(payer, stream.streamID);

        return stream.streamID;
    }

    // function getValidClaimAmount(uint256 blockTimestamp, uint256 streamID) view internal returns (uint256) {
    //     uint256 validClaimAmount = streams[streamID].totalAmount * ((blockTimestamp - streams[streamID].startTime) / (streams[streamID].endTime - streams[streamID].startTime));
    //     validClaimAmount -= streams[streamID].claimedAmount;
    //     return validClaimAmount;
    // }

    // call this function to check the valid amount able to claim before calling claimPayment
    function countValidClaimAmount(uint256 streamID) external {
        require(streams[streamID].receiver == msg.sender, "This streamID's receiver is not you, you cannot claim the asset");

        uint256 blockTimestamp = block.timestamp;
        console.log("blockTimestamp in countValidClaimAmount: ", blockTimestamp);
        console.log("streams[streamID].startTime in countValidClaimAmount: ", streams[streamID].startTime);
        require(blockTimestamp > streams[streamID].startTime, "The payment not yet start, you can't claim it");
        console.log("streams[streamID].endTime in countValidClaimAmount: ", streams[streamID].endTime);
        console.log("(blockTimestamp - streams[streamID].startTime) in countValidClaimAmount: ", (blockTimestamp - streams[streamID].startTime));
        console.log("(streams[streamID].endTime - streams[streamID].startTime) in countValidClaimAmount: ",  (streams[streamID].endTime - streams[streamID].startTime));
        console.log("(streams[streamID].totalAmount * (blockTimestamp - streams[streamID].startTime)): ", (streams[streamID].totalAmount * (blockTimestamp - streams[streamID].startTime)));
        console.log("(streams[streamID].totalAmount * (blockTimestamp - streams[streamID].startTime)) / (streams[streamID].endTime - streams[streamID].startTime): ", (streams[streamID].totalAmount * (blockTimestamp - streams[streamID].startTime)) / (streams[streamID].endTime - streams[streamID].startTime));

        console.log("countValidClaimAmount - 2");
        // uint256 validClaimAmount = (streams[streamID].totalAmount * (blockTimestamp - streams[streamID].startTime)) / (streams[streamID].endTime - streams[streamID].startTime);
        uint256 validClaimAmount = 0;
        if(blockTimestamp >= streams[streamID].endTime) {
            validClaimAmount = streams[streamID].totalAmount;
        } else {
            validClaimAmount = (streams[streamID].totalAmount * (blockTimestamp - streams[streamID].startTime)) / (streams[streamID].endTime - streams[streamID].startTime);
        }
        
        console.log("countValidClaimAmount - 3");
        validClaimAmount -= streams[streamID].claimedAmount;
        streams[streamID].validClaimAmount = validClaimAmount;  // renew the member of the struct
        // uint256 validClaimAmount = getValidClaimAmount(blockTimestamp, streamID);
        // return validClaimAmount;
    }

    function claimPayment(uint256 streamID, uint256 claimAmount) external {
        console.log("enter claimPayment - 1");
        require(streams[streamID].receiver == msg.sender, "This streamID's receiver is not you, you cannot claim the asset");
        console.log("enter claimPayment - 2");
        uint256 blockTimestamp = block.timestamp;
        console.log("blockTimestamp in claimPayment: ", blockTimestamp);
        console.log("streams[streamID].startTime in claimPayment: ", streams[streamID].startTime);

        require(blockTimestamp > streams[streamID].startTime, "The payment not yet start, you can't claim it");

        // the amount able to claim - the amount already claimed
        console.log("blockTimestamp in solidity: ", blockTimestamp);
        console.log("streams[streamID].startTime: ", streams[streamID].startTime);

        uint256 tmp_1 = (blockTimestamp - streams[streamID].startTime);
        console.log("tmp_1: ", tmp_1);
        uint256 tmp_2 = (streams[streamID].endTime - streams[streamID].startTime);
        console.log("tmp_2: ", tmp_2);

        // uint256 tmp = (blockTimestamp - streams[streamID].startTime) / (streams[streamID].endTime - streams[streamID].startTime);
        // console.log("tmp: ", tmp);
        // uint256 validClaimAmount = streams[streamID].totalAmount * tmp;
        uint256 validClaimAmount = 0;
        if(blockTimestamp >= streams[streamID].endTime) {
            validClaimAmount = streams[streamID].totalAmount;
        } else {
            validClaimAmount = (streams[streamID].totalAmount * (blockTimestamp - streams[streamID].startTime)) / (streams[streamID].endTime - streams[streamID].startTime);
        }
        
        console.log("validClaimAmount - 1: ", validClaimAmount);
        validClaimAmount -= streams[streamID].claimedAmount;
        console.log("validClaimAmount - 2: ", validClaimAmount);
        require(claimAmount <= validClaimAmount, "claimAmount larger than validClaimAmount");

        // ERC20Token = 
        console.log("contract token number: ", IERC20(streams[streamID].tokenAddress).balanceOf(address(this)));

        // transfer from this contract to the streams[streamID].receiver
        // IERC20(streams[streamID].tokenAddress).transferFrom(address(this), streams[streamID].receiver, claimAmount);
        IERC20(streams[streamID].tokenAddress).transfer(streams[streamID].receiver, claimAmount);  // transferFrom function need approval of contract address
        streams[streamID].claimedAmount += claimAmount;
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
            if(streams[i].payer == msg.sender) {
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