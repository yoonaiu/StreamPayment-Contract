// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StreamPayment {

    uint256 totalStreams = 1;  // start from 1 (to be different from default value), will be next streamID
    mapping (uint => Stream) streams;  // use streamID to query
    // mapping (uint => address) streamsOwner;  // [streamID, owner]
    mapping (address => uint256[]) streamsIDBelongToAOwner;  // [owner, streamID]

    enum StreamState {
        notStarted,
        ongoing,
        finished
    }

    struct Stream {
        string  title;
        address payer;
        address receiver;
        address token;
        uint256 totalAmount;
        uint256 claimedAmount;  // remainedAmount = totalAmount - claimedAmount
        uint256 startTime;
        uint256 endTime;
        StreamState state;
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
                          address token,        // currently support ERC20 token
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
        require(isValidERC20Token(token) == true, "Token address is not a valid ERC20 token");

        // [TODO] transfer token from the payer's address to this contract
        //   1. check if the remain amount is enough

        // stream
        Stream memory stream;  // memory: temporary usage
        stream.title    = title;
        stream.payer    = payer;
        stream.receiver = receiver;
        stream.token    = token;
        stream.totalAmount      = totalAmount;
        stream.claimedAmount    = 0;
        stream.startTime        = startTime;
        stream.endTime          = endTime;
        stream.state            = StreamState.notStarted;
        stream.streamID         = totalStreams;
        totalStreams++;

        streams[stream.streamID] = stream;
        streamsIDBelongToAOwner[msg.sender].push(stream.streamID);

        return stream.streamID;
    }

    // which streamID of one owner is claiming
    function claimPayment(uint256 streamID, uint256 _claimAmount) external {
        uint256[] memory streamIDList = streamsBelongToAOwner[msg.sender];
        bool found = false;
        Stream memory stream;
        for(uint i = 0; i < streamIDList.length; i++) {
            if(streams[streamIDList[i]].streamID == streamID) {
                // mark as found
                found = true;
                // get the stream out
                stream = streams[streamIDList[i]];
            }
        }
        require(found == true, "Didn't find the streamID in your receiving record");

        uint256 validClaimAmount = stream.totalAmount * ((block.timestamp - stream.startTime) / (stream.endTime - stream.startTime));
        validClaimAmount -= stream.claimedAmount;
        require(_claimAmount <= validClaimAmount, "claimedAmount larger than validClaimAmount");

        // transfer from this contract to the msg.sender
        IERC20(stream.token).transferFrom(address(this), msg.sender, _claimAmount);
        streams[streamID].claimAmount -= _claimAmount;
    }

    // owner, receiver request to know -> [TODO] need to split
    // try gas report
    // return all info of the payment filter by state to show in the frontend
    // query the info with streamID, access control just to higher the difficulty of one to see the info of others
    function getStreamInfo(StreamState state) view external {
        // require(streamsBelongToAOwner[msg.sender].length > 0, "This address doesn't own any stream"); // whether to block -> seems no need
        Stream[] memory streamsInfo = new Stream[](streamsIDBelongToAOwner[msg.sender].length);  // new 出 array
        for(uint i = 0; i < streamsIDBelongToAOwner[msg.sender].length; i++) {
            streamsInfo[i] = streams[streamsIDBelongToAOwner[msg.sender][i]];
        }
        return streamsInfo;
    }
}