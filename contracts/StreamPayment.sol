// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

contract StreamPayment {

    uint256 totalStreams = 0;  // start from 0, will be next streamID
    mapping (uint => Stream) streams;  // use streamID to query
    mapping (uint => address) streamsOwner;  // [streamID, owner]

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


    function createStream(string  title,
                          address payer,
                          address receiver,
                          address token,    // bitcoin, eth(?), all ERC20 token
                          uint256 totalAmount,
                          uint256 startTime,
                          uint256 endTime
                          ) external {
        pass;
    }

    // gas report
    // return all info of the payment filter by state to show in the frontend
    // query the info with streamID, access control just to higher the difficulty of one to see the info of others
    function getStreamInfo(uint256 _streamID, StreamState state) view external {
        require(msg.sender == streamsOwner[_streamID], "You are not the owner of this stream");
        pass;
    }

}