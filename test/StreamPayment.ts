import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
// import "solidity-coverage"

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function getDateNow() {
    return Math.floor(Date.now() / 1000) + 10;
}

describe('StreamPayment', function () {
    async function beforeEachFixture() {
        // -> owner is the one to deploy following contract -> verified by console.log
        const [owner, payer, receiver] = await ethers.getSigners();

        const _StreamPayment = await ethers.getContractFactory('StreamPayment');
        const StreamPayment = await _StreamPayment.deploy();

        const _ERC20Token = await ethers.getContractFactory("TestToken");
        const ERC20Token = await _ERC20Token.deploy("TestToken", "TEST");        // the parameter to the contract constructor

        const zeroAddress = "0x0000000000000000000000000000000000000000";

        // set up the "valid" parameter
        const title = "test transfer title";
        const tokenAddress = ERC20Token.address;
        const totalAmount = 100;
        const startTime = getDateNow() + 10;  // uint in second
        const endTime = getDateNow() + 40;

        await ERC20Token.connect(owner).transfer(payer.address, totalAmount);
        await ERC20Token.connect(payer).approve(StreamPayment.address, totalAmount);

        return { zeroAddress, owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime }
    }

    describe("StreamPayment getPayerStreamInfo", function () {
        it("Should get payer stream info correctly", async function () {
            const { owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await StreamPayment.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "StreamCreated")[0]
            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(1)
                return;
            }
            const return_streamID = eventArgs[1]

            let streamsInfo = await StreamPayment.connect(payer).getPayerStreamInfo();
            
            expect(streamsInfo[0].title).to.equal(title);
            expect(streamsInfo[0].payer).to.equal(payer.address);
            expect(streamsInfo[0].receiver).to.equal(receiver.address);
            expect(streamsInfo[0].tokenAddress).to.equal(tokenAddress);
            expect(streamsInfo[0].totalAmount).to.equal(totalAmount);
            expect(streamsInfo[0].claimedAmount).to.equal(0);
            expect(streamsInfo[0].validClaimAmount).to.equal(0);
            expect(streamsInfo[0].startTime).to.equal(startTime);
            expect(streamsInfo[0].endTime).to.equal(endTime);
            expect(streamsInfo[0].streamID).to.equal(return_streamID);

            // sleep until stream payment start
            await sleep(1000 * 20);

            // after countValidClaimAmount
            await StreamPayment.connect(receiver).countValidClaimAmount(return_streamID);
            let [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamvalidClaimAmount, streamStartTime, streamEndTime, streamID
            ] = await StreamPayment.streams(return_streamID)
            streamsInfo = await StreamPayment.connect(payer).getPayerStreamInfo();

            expect(streamsInfo[0].validClaimAmount).to.equal(streamvalidClaimAmount);

            // after claimPayment
            let inputClaimedAmount = streamvalidClaimAmount;
            await StreamPayment.connect(receiver).claimPayment(return_streamID, inputClaimedAmount);
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamvalidClaimAmount, streamStartTime, streamEndTime, streamID
            ] = await StreamPayment.streams(return_streamID)
            streamsInfo = await StreamPayment.connect(payer).getPayerStreamInfo();

            expect(streamsInfo[0].claimedAmount).to.equal(inputClaimedAmount);
        });
    });

    describe("StreamPayment getReceiverStreamInfo", function () {
        it("Should get receiver stream info correctly", async function () {
            const { owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await StreamPayment.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "StreamCreated")[0]
            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(1)
                return;
            }
            const return_streamID = eventArgs[1]

            let streamsInfo = await StreamPayment.connect(receiver).getReceiverStreamInfo();
            
            expect(streamsInfo[0].title).to.equal(title);
            expect(streamsInfo[0].payer).to.equal(payer.address);
            expect(streamsInfo[0].receiver).to.equal(receiver.address);
            expect(streamsInfo[0].tokenAddress).to.equal(tokenAddress);
            expect(streamsInfo[0].totalAmount).to.equal(totalAmount);
            expect(streamsInfo[0].claimedAmount).to.equal(0);
            expect(streamsInfo[0].validClaimAmount).to.equal(0);
            expect(streamsInfo[0].startTime).to.equal(startTime);
            expect(streamsInfo[0].endTime).to.equal(endTime);
            expect(streamsInfo[0].streamID).to.equal(return_streamID);

            // sleep until stream payment start
            await sleep(1000 * 20);

            // after countValidClaimAmount
            await StreamPayment.connect(receiver).countValidClaimAmount(return_streamID);
            let [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamvalidClaimAmount, streamStartTime, streamEndTime, streamID
            ] = await StreamPayment.streams(return_streamID)
            streamsInfo = await StreamPayment.connect(receiver).getReceiverStreamInfo();

            expect(streamsInfo[0].validClaimAmount).to.equal(streamvalidClaimAmount);

            // after claimPayment
            let inputClaimedAmount = streamvalidClaimAmount;
            await StreamPayment.connect(receiver).claimPayment(return_streamID, inputClaimedAmount);
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamvalidClaimAmount, streamStartTime, streamEndTime, streamID
            ] = await StreamPayment.streams(return_streamID)
            streamsInfo = await StreamPayment.connect(receiver).getReceiverStreamInfo();

            expect(streamsInfo[0].claimedAmount).to.equal(inputClaimedAmount);
        });
    });

    describe("StreamPayment createStream", function () {
        it("startTime should be later than block.timestamp", async function () {
            const { zeroAddress, owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);

            await expect(StreamPayment.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime - 100,
                endTime)).to.be.revertedWith("Start time is in the past");
        });

        it("endTime should be later than block.timestamp", async function () {
            const { zeroAddress, owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(
                StreamPayment.connect(payer).createStream(title,
                    payer.address,
                    receiver.address,
                    tokenAddress,
                    totalAmount,
                    startTime,
                    getDateNow() - 100
                )
            ).to.be.revertedWith("End time is in the past");
        });

        it("endTime should not equal to startTime", async function () {
            const { zeroAddress, owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(
                StreamPayment.connect(payer).createStream(title,
                    payer.address,
                    receiver.address,
                    tokenAddress,
                    totalAmount,
                    endTime,
                    endTime
                )
            ).to.be.revertedWith("End time should be later than start time");
        });

        it("endTime should be later than startTime", async function () {
            const { zeroAddress, owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(
                StreamPayment.connect(payer).createStream(title,
                    payer.address,
                    receiver.address,
                    tokenAddress,
                    totalAmount,
                    endTime,
                    endTime - 10
                )
            ).to.be.revertedWith("End time should be later than start time");
        });

        it("payer address should not be zero address", async function () {
            const { zeroAddress, owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(StreamPayment.connect(payer).createStream(title,
                zeroAddress,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime)).to.be.revertedWith("payer address should not be zero address");
        });

        it("receiver address should not be zero address", async function () {
            const { zeroAddress, owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(StreamPayment.connect(payer).createStream(title,
                payer.address,
                zeroAddress,
                tokenAddress,
                totalAmount,
                startTime,
                endTime)).to.be.revertedWith("receiver address should not be zero address");
        });

        it("Payer should not be the same as receiver", async function () {
            const { owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(StreamPayment.connect(payer).createStream(title,
                payer.address,
                payer.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime)).to.be.revertedWith("Payer should not be the same as receiver");
        });


        it("Transfer amount of the token should be greater than zero", async function () {
            const { owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(StreamPayment.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                0,
                startTime,
                endTime)).to.be.revertedWith("Transfer amount of the token should be greater than zero");
        });


        it("Token address should be a valid ERC20 token", async function () {
            const { zeroAddress, owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(StreamPayment.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                zeroAddress,
                totalAmount,
                startTime,
                endTime)).to.be.revertedWith("Token address is not a valid ERC20 token");
        });


        it("Payer should not createStream without enough token amount", async function () {
            const { owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await ERC20Token.connect(payer).transfer(owner.address, totalAmount);  // transfer back the init fund to the owner address
            await expect(StreamPayment.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime)).to.be.revertedWith("The payer's token amount is not enough to create the stream");
        });


        it("Payer should successfully createStream with valid parameters and add correct stream record into the contract", async function () {
            const { owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await StreamPayment.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "StreamCreated")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(1)
                return;
            }
            const return_streamID = eventArgs[1]

            const [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, validClaimAmount, streamStartTime, streamEndTime, streamID
            ] = await StreamPayment.streams(return_streamID)

            expect(streamTitle).to.equal(title);
            expect(streamPayer).to.equal(payer.address);
            expect(streamReceiver).to.equal(receiver.address);
            expect(streamTokenAddress).to.equal(tokenAddress);
            expect(streamTotalAmount).to.equal(totalAmount);
            expect(streamClaimedAmount).to.equal(0);
            expect(validClaimAmount).to.equal(0);
            expect(streamStartTime).to.equal(startTime);
            expect(streamEndTime).to.equal(endTime);
            expect(streamID).to.equal(return_streamID);
        });
    });

    describe("StreamPayment claimPayment", function () {
        it("Should not claim the fund with the streamID's receiver address is not the claimer's address", async function () {
            const { owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await StreamPayment.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "StreamCreated")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(1)
                return;
            }
            const return_streamID = eventArgs[1]

            const [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamStartTime, streamEndTime, streamID
            ] = await StreamPayment.streams(return_streamID)

            // payer claim the stream payment himself
            await expect(StreamPayment.connect(payer).claimPayment(return_streamID, 10)).to.be.revertedWith("This streamID's receiver is not you, you cannot claim the asset");
        });

        it("Should not claim the fund with claimAmount larger than validClaimAmount - case 1", async function () {
            const { owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await StreamPayment.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "StreamCreated")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(1)
                return;
            }
            const return_streamID = eventArgs[1]

            const [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamStartTime, streamEndTime, streamID
            ] = await StreamPayment.streams(return_streamID)

            await sleep(1000 * 20);  // sleep until stream start
            await expect(StreamPayment.connect(receiver).claimPayment(return_streamID, 110)).to.be.revertedWith("claimAmount larger than validClaimAmount");
        });

        it("Should not claim the fund with claimAmount larger than validClaimAmount - case 2", async function () {
            const { owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await StreamPayment.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,  // 100
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "StreamCreated")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(1)
                return;
            }
            const return_streamID = eventArgs[1]

            let [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamvalidClaimAmount, streamStartTime, streamEndTime, streamID
            ] = await StreamPayment.streams(return_streamID)

            await sleep(1000 * 20);  // sleep until stream start
            await StreamPayment.connect(receiver).countValidClaimAmount(return_streamID);
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamvalidClaimAmount, streamStartTime, streamEndTime, streamID
            ] = await StreamPayment.streams(return_streamID)

            let finalClaimAmount = streamvalidClaimAmount.add(BigNumber.from(10));  // streamvalidClaimAmount + 10
            await expect(StreamPayment.connect(receiver).claimPayment(return_streamID, finalClaimAmount)).to.be.revertedWith("claimAmount larger than validClaimAmount");
        });

        it("Should successfully claim claimAmount with valid condition and change the corressponding record in contract - case 1", async function () {
            const { owner, payer, receiver, StreamPayment, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await StreamPayment.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,  // 100
                startTime,
                endTime);

            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "StreamCreated")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(1)
                return;
            }
            const return_streamID = eventArgs[1]

            let [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamvalidClaimAmount, streamStartTime, streamEndTime, streamID
            ] = await StreamPayment.streams(return_streamID)

            await sleep(1000 * 20);  // sleep until stream start
            await StreamPayment.connect(receiver).countValidClaimAmount(return_streamID);
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamvalidClaimAmount, streamStartTime, streamEndTime, streamID
            ] = await StreamPayment.streams(return_streamID)

            const inputClaimedAmount = streamvalidClaimAmount;
            await StreamPayment.connect(receiver).claimPayment(return_streamID, inputClaimedAmount);
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamvalidClaimAmount, streamStartTime, streamEndTime, streamID
            ] = await StreamPayment.streams(return_streamID)

            expect(streamClaimedAmount).to.equal(inputClaimedAmount);
        });
    });

});
