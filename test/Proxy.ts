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

describe('Proxy', function () {
    async function beforeEachFixture() {
        // -> owner is the one to deploy following contract -> verified by console.log
        const [owner, payer, receiver] = await ethers.getSigners();

        const _logicContract = await ethers.getContractFactory('StreamPayment');
        const logicContract = await _logicContract.deploy();

        const _proxyContract = await ethers.getContractFactory('Proxy');
        const proxyContract = (await _proxyContract.deploy(logicContract.address, owner.address)) as Contract;

        // attach logicContract's member functions onto proxyContract.address
        // when calling proxyContract.address, will map to those functions of logicContract
        const proxiedContract = logicContract.attach(proxyContract.address);

        const _ERC20Token = await ethers.getContractFactory("LocalTestToken");
        const ERC20Token = await _ERC20Token.deploy("TestToken", "TEST");

        const zeroAddress = "0x0000000000000000000000000000000000000000";

        // set up the "valid" parameter
        const title = "test transfer title";
        const tokenAddress = ERC20Token.address;
        const totalAmount = 100;
        const startTime = getDateNow() + 10;  // uint in second
        const endTime = getDateNow() + 40;

        await ERC20Token.connect(owner).transfer(payer.address, totalAmount);
        await ERC20Token.connect(payer).approve(proxiedContract.address, totalAmount);

        return { owner, payer, receiver, logicContract, proxyContract, proxiedContract, ERC20Token, zeroAddress, title, tokenAddress, totalAmount, startTime, endTime }
    }

    /* ----------------------------- Check Proxy ----------------------------- */
    describe("Proxy Deployment", function () {        
        it("Should set the right owner and logic", async function () {
            const { owner, logicContract, proxyContract } = await loadFixture(beforeEachFixture);

            expect(await proxyContract.getProxyOwner()).to.equal(owner.address);
            expect(await proxyContract.getLogic()).to.equal(logicContract.address);
        });
    });

    /* Check contract Proxy changeLogic correctness. */
    describe("Proxy changeLogic", function () {
        it('Should allow the owner to change the logic contract', async function () {
            const { owner, logicContract, proxyContract } = await loadFixture(beforeEachFixture);
            
            // we only need different contract address
            const _newlogicContract = await ethers.getContractFactory('StreamPayment');
            const newLogicContract = await _newlogicContract.deploy();

            await proxyContract.connect(owner).changeLogic(newLogicContract.address);
            expect(await proxyContract.getLogic()).to.equal(newLogicContract.address);
            expect(await proxyContract.getLogic()).to.not.equal(logicContract.address);
        });

        it('Should not allow non-owners to change the logic contract', async function () {
            const { owner, payer, logicContract, proxyContract } = await loadFixture(beforeEachFixture);
            
            // we only need different contract address
            const _newlogicContract = await ethers.getContractFactory('StreamPayment');
            const newLogicContract = await _newlogicContract.deploy();
            
            await expect(proxyContract.connect(payer).changeLogic(newLogicContract.address)).to.be.revertedWith('Only the owner of this contract can change the logic that Proxy points to!');
        });
    });


    /* ----------------------------- Check Logic work as original ----------------------------- */
    describe("StreamPayment getPayerStreamInfo", function () {
        it("Should get payer stream info correctly", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]
            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            let streamsInfo = await proxiedContract.connect(payer).getPayerStreamInfo();
            
            expect(streamsInfo[0].title).to.equal(title);
            expect(streamsInfo[0].payer).to.equal(payer.address);
            expect(streamsInfo[0].receiver).to.equal(receiver.address);
            expect(streamsInfo[0].tokenAddress).to.equal(tokenAddress);
            expect(streamsInfo[0].totalAmount).to.equal(totalAmount);
            expect(streamsInfo[0].claimedAmount).to.equal(0);
            expect(streamsInfo[0].partialAmountAbleToClaim).to.equal(0);
            expect(streamsInfo[0].validClaimAmount).to.equal(0);
            expect(streamsInfo[0].startTime).to.equal(startTime);
            expect(streamsInfo[0].endTime).to.equal(endTime);
            expect(streamsInfo[0].streamID).to.equal(return_streamID);
            expect(streamsInfo[0].terminatedHalfway).to.equal(false);

            // sleep until stream payment start
            await sleep(1000 * 20);

            // after countValidClaimAmount
            await proxiedContract.connect(receiver).countValidClaimAmount(return_streamID);
            let [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamValidClaimAmount, streamStartTime, streamEndTime, streamID
            ] = await proxiedContract.streams(return_streamID)
            streamsInfo = await proxiedContract.connect(payer).getPayerStreamInfo();

            expect(streamsInfo[0].validClaimAmount).to.equal(streamValidClaimAmount);

            // after claimPayment
            let inputClaimedAmount = streamValidClaimAmount;
            await proxiedContract.connect(receiver).claimPayment(return_streamID, inputClaimedAmount);
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamValidClaimAmount, streamStartTime, streamEndTime, streamID
            ] = await proxiedContract.streams(return_streamID)
            streamsInfo = await proxiedContract.connect(payer).getPayerStreamInfo();

            expect(streamsInfo[0].claimedAmount).to.equal(inputClaimedAmount);

            // after terminatePayment
            await proxiedContract.connect(payer).terminatePayment(return_streamID);
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamValidClaimAmount, streamStartTime, streamEndTime, streamID
            ] = await proxiedContract.streams(return_streamID)
            streamsInfo = await proxiedContract.connect(payer).getPayerStreamInfo();

            expect(streamsInfo[0].terminatedHalfway).to.equal(true);
        });
    });

    describe("StreamPayment getReceiverStreamInfo", function () {
        it("Should get receiver stream info correctly", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]
            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            let streamsInfo = await proxiedContract.connect(receiver).getReceiverStreamInfo();
            
            expect(streamsInfo[0].title).to.equal(title);
            expect(streamsInfo[0].payer).to.equal(payer.address);
            expect(streamsInfo[0].receiver).to.equal(receiver.address);
            expect(streamsInfo[0].tokenAddress).to.equal(tokenAddress);
            expect(streamsInfo[0].totalAmount).to.equal(totalAmount);
            expect(streamsInfo[0].claimedAmount).to.equal(0);
            expect(streamsInfo[0].partialAmountAbleToClaim).to.equal(0);
            expect(streamsInfo[0].validClaimAmount).to.equal(0);
            expect(streamsInfo[0].startTime).to.equal(startTime);
            expect(streamsInfo[0].endTime).to.equal(endTime);
            expect(streamsInfo[0].streamID).to.equal(return_streamID);
            expect(streamsInfo[0].terminatedHalfway).to.equal(false);

            // sleep until stream payment start
            await sleep(1000 * 20);

            // after countValidClaimAmount
            await proxiedContract.connect(receiver).countValidClaimAmount(return_streamID);
            let [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)
            streamsInfo = await proxiedContract.connect(receiver).getReceiverStreamInfo();

            expect(streamsInfo[0].validClaimAmount).to.equal(streamValidClaimAmount);

            // after claimPayment
            let inputClaimedAmount = streamValidClaimAmount;
            await proxiedContract.connect(receiver).claimPayment(return_streamID, inputClaimedAmount);
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)
            streamsInfo = await proxiedContract.connect(receiver).getReceiverStreamInfo();

            expect(streamsInfo[0].claimedAmount).to.equal(inputClaimedAmount);

            // after terminatePayment
            await proxiedContract.connect(payer).terminatePayment(return_streamID);
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)
            streamsInfo = await proxiedContract.connect(payer).getPayerStreamInfo();

            expect(streamsInfo[0].terminatedHalfway).to.equal(true);
        });
    });

    describe("StreamPayment createStream", function () {
        it("startTime should be later than block.timestamp", async function () {
            const { zeroAddress, owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);

            await expect(proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime - 100,
                endTime)).to.be.revertedWith("Start time is in the past");
        });

        it("endTime should be later than block.timestamp", async function () {
            const { zeroAddress, owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(
                proxiedContract.connect(payer).createStream(title,
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
            const { zeroAddress, owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(
                proxiedContract.connect(payer).createStream(title,
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
            const { zeroAddress, owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(
                proxiedContract.connect(payer).createStream(title,
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
            const { zeroAddress, owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(proxiedContract.connect(payer).createStream(title,
                zeroAddress,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime)).to.be.revertedWith("payer address should not be zero address");
        });

        it("receiver address should not be zero address", async function () {
            const { zeroAddress, owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(proxiedContract.connect(payer).createStream(title,
                payer.address,
                zeroAddress,
                tokenAddress,
                totalAmount,
                startTime,
                endTime)).to.be.revertedWith("receiver address should not be zero address");
        });

        it("Payer should not be the same as receiver", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(proxiedContract.connect(payer).createStream(title,
                payer.address,
                payer.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime)).to.be.revertedWith("Payer should not be the same as receiver");
        });


        it("Transfer amount of the token should be greater than zero", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                0,
                startTime,
                endTime)).to.be.revertedWith("Transfer amount of the token should be greater than zero");
        });


        it("Token address should be a valid ERC20 token", async function () {
            const { zeroAddress, owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await expect(proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                zeroAddress,
                totalAmount,
                startTime,
                endTime)).to.be.revertedWith("Token address is not a valid ERC20 token");
        });


        it("Payer should not createStream without enough token amount", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            await ERC20Token.connect(payer).transfer(owner.address, totalAmount);  // transfer back the init fund to the owner address
            await expect(proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime)).to.be.revertedWith("The payer's token amount is not enough to create the stream");
        });


        it("Payer should successfully createStream with valid parameters, add correct stream record into the contract, and emit correct event", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_payer = eventArgs[0];
            const return_streamID = eventArgs[2];

            // check emit event parameter
            expect(return_payer).to.equal(payer.address);
            expect(return_streamID).to.equal(0);

            const [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway
            ] = await proxiedContract.streams(return_streamID)

            expect(streamTitle).to.equal(title);
            expect(streamPayer).to.equal(payer.address);
            expect(streamReceiver).to.equal(receiver.address);
            expect(streamTokenAddress).to.equal(tokenAddress);
            expect(streamTotalAmount).to.equal(totalAmount);
            expect(streamClaimedAmount).to.equal(0);
            expect(streamPartialAmountAbleToClaim).to.equal(0);
            expect(streamValidClaimAmount).to.equal(0);
            expect(streamStartTime).to.equal(startTime);
            expect(streamEndTime).to.equal(endTime);
            expect(streamStreamID).to.equal(return_streamID);
            expect(streamTerminatedHalfway).to.equal(false);
        });
    });

    describe("StreamPayment claimPayment", function () {
        it("Should not claimPayment with invalid streamID", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            const [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            // the only valid StreamID now is 0
            const invalidStreamID = 1;
            await expect(proxiedContract.connect(payer).claimPayment(100, invalidStreamID)).to.be.revertedWith("Invalid streamID");
        });

        it("Should not claimPayment with the streamID's receiver address is not the claimer's address", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            const [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            // payer claim the stream payment himself
            await expect(proxiedContract.connect(payer).claimPayment(return_streamID, 10)).to.be.revertedWith("This streamID's receiver is not you, you cannot claim the asset");
        });

        it("Should not claimPayment with claimAmount larger than validClaimAmount - case 1", async function () {
            // [ simply greater than total amount ]
            
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            const [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            await sleep(1000 * 20);  // sleep until stream start
            await expect(proxiedContract.connect(receiver).claimPayment(return_streamID, 110)).to.be.revertedWith("claimAmount larger than validClaimAmount");
        });

        it("Should not claimPayment with claimAmount larger than validClaimAmount - case 2", async function () {
            // [ slightly greater than current valid amount counted by contract ]

            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,  // 100
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            let [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            await sleep(1000 * 20);  // sleep until stream start
            await proxiedContract.connect(receiver).countValidClaimAmount(return_streamID);
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            let finalClaimAmount = streamValidClaimAmount.add(BigNumber.from(10));  // streamValidClaimAmount + 10
            await expect(proxiedContract.connect(receiver).claimPayment(return_streamID, finalClaimAmount)).to.be.revertedWith("claimAmount larger than validClaimAmount");
        });

        it("Should successfully claim claimAmount with valid condition, change the corressponding record in contract, and emit correct event - case 1", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,  // 100
                startTime,
                endTime);

            let receipt = await tx.wait();
            let event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]
            
            let eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            // check emit event parameter
            let return_payer = eventArgs[0]
            let return_receiver = eventArgs[1]
            const return_streamID = eventArgs[2]
            expect(return_payer).to.equal(payer.address);
            expect(return_receiver).to.equal(receiver.address);
            expect(return_streamID).to.equal(0);

            let [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            await sleep(1000 * 20);  // sleep until stream start
            await proxiedContract.connect(receiver).countValidClaimAmount(return_streamID);
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            const inputClaimedAmount = streamValidClaimAmount;

            // check emit event of claimPayment & event parameter
            tx = await proxiedContract.connect(receiver).claimPayment(return_streamID, inputClaimedAmount);
            receipt = await tx.wait();
            event = receipt.events?.filter(event => event.event == "claimPaymentEvent")[0]
            eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const next_return_streamID = eventArgs[0]
            const claimAmount = eventArgs[1]
            expect(next_return_streamID).to.equal(return_streamID);
            expect(claimAmount).to.equal(inputClaimedAmount);
            
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            expect(streamClaimedAmount).to.equal(inputClaimedAmount);
        });
    });


    describe("StreamPayment terminatePayment", function () {

        it("Should not terminate the payment with invalid streamID", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            const [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            // the only valid StreamID now is 0
            const invalidStreamID = 1;
            await expect(proxiedContract.connect(payer).terminatePayment(invalidStreamID)).to.be.revertedWith("Invalid streamID");
        });

        it("Should not terminate the payment with the streamID's payer address is not the claimer's address", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            const [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            await sleep(1000 * 20);  // sleep until stream start
        
            // payer claim the stream payment himself
            await expect(proxiedContract.connect(receiver).terminatePayment(return_streamID)).to.be.revertedWith("This streamID's payer is not you, you cannot terminate the payment");
        });

        it("Should not terminate payment twice", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            let [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)
            expect(streamTerminatedHalfway).to.equal(false);

            await sleep(1000 * 20);  // sleep until stream start

            // terminatePayment
            await proxiedContract.connect(payer).terminatePayment(return_streamID);
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            expect(streamTerminatedHalfway).to.equal(true);
            
            // terminatePayment twice
            await expect(proxiedContract.connect(payer).terminatePayment(return_streamID)).to.be.revertedWith("Cannot terminate twice");
        });

        it("Should not terminate the payment before the payment start", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            const [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            // payer claim the stream payment himself
            await expect(proxiedContract.connect(payer).terminatePayment(return_streamID)).to.be.revertedWith("The payment not yet start, you cannot terminate it");
        });

        it("Should not terminate the payment after the payment end", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            const [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            await sleep(1000 * 50);  // sleep until end

            // payer claim the stream payment himself
            await expect(proxiedContract.connect(payer).terminatePayment(return_streamID)).to.be.revertedWith("The payment has already done, you cannot terminate it");
        });

        it("Should successfully terminate the payment by payer, change the record in contract, and emit correct event", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            let event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            let eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            let [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            expect(streamTerminatedHalfway).to.equal(false);

            await sleep(1000 * 20);

            // terminatePayment & check emit event of claimPayment & event parameter
            // await proxiedContract.connect(payer).terminatePayment(return_streamID);
            tx = await proxiedContract.connect(payer).terminatePayment(return_streamID);
            receipt = await tx.wait();
            event = receipt.events?.filter(event => event.event == "terminatePaymentEvent")[0]
            eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const next_return_streamID = eventArgs[0]
            expect(next_return_streamID).to.equal(return_streamID);

            // change record in contract after terminatePayment
            // partialAmountAbleToClaim & validClaimAmount will not change anymore
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)
            expect(streamTerminatedHalfway).to.equal(true);

            let partialAmountAbleToClaimSnapShot = streamPartialAmountAbleToClaim;
            let validClaimAmountSnapShot = streamValidClaimAmount;
            
            await sleep(1000 * 10);

            // should not change the amount(after terminate, keep calling countValidClaimAmount
            // sleep and call countValidClaimAmount will not change partialAmountAbleToClaimSnapShot & validClaimAmountSnapShot
            await proxiedContract.connect(receiver).countValidClaimAmount(return_streamID);

            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            expect(partialAmountAbleToClaimSnapShot).to.equal(streamPartialAmountAbleToClaim);
            expect(validClaimAmountSnapShot).to.equal(streamValidClaimAmount);
            expect(streamTerminatedHalfway).to.equal(true);
        });
    });
    

    describe("StreamPayment countValidClaimAmount", function () {

        it("Should not call countValidClaimAmount with invalid streamID", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            const [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            // the only valid StreamID now is 0
            const invalidStreamID = 1;
            await expect(proxiedContract.connect(payer).countValidClaimAmount(invalidStreamID)).to.be.revertedWith("Invalid streamID");
        });

        it("Should not call countValidClaimAmount using non-receiver address", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            let [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            await sleep(1000 * 20);  // sleep until stream start
            await expect(proxiedContract.connect(payer).countValidClaimAmount(return_streamID)).to.be.revertedWith("This streamID's receiver is not you, you cannot count the claim asset");
        });

        it("Should not call countValidClaimAmount before payment start", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            let [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            await expect(proxiedContract.connect(receiver).countValidClaimAmount(return_streamID)).to.be.revertedWith("The payment not yet start, you cannot count the claim asset");
        });


        it("Should not change the partialAmountAbleToClaim and validClaimAmount(without claimPayment) by calling countValidClaimAmount after terminatedHalfway", async function () {
            const { owner, payer, receiver, proxiedContract, ERC20Token, title, tokenAddress, totalAmount, startTime, endTime } = await loadFixture(beforeEachFixture);
            let tx = await proxiedContract.connect(payer).createStream(title,
                payer.address,
                receiver.address,
                tokenAddress,
                totalAmount,
                startTime,
                endTime);
            let receipt = await tx.wait();
            const event = receipt.events?.filter(event => event.event == "createStreamEvent")[0]

            const eventArgs = event?.args;
            if (eventArgs == undefined) {
                expect(eventArgs).to.be.equal(2)
                return;
            }
            const return_streamID = eventArgs[2]

            let [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            await sleep(1000 * 20);  // sleep until stream start
            
            // terminatePayment
            await proxiedContract.connect(payer).terminatePayment(return_streamID);
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            let partialAmountAbleToClaimSnapShot = streamPartialAmountAbleToClaim;
            let validClaimAmountSnapShot = streamValidClaimAmount;

            // for time pass
            await sleep(1000 * 10);

            // call countValidClaimAmount with receiver
            await proxiedContract.connect(receiver).countValidClaimAmount(return_streamID);
            
            // new amount record should not change
            [streamTitle, streamPayer, streamReceiver, streamTokenAddress,
                streamTotalAmount, streamClaimedAmount, streamPartialAmountAbleToClaim, streamValidClaimAmount, streamStartTime, streamEndTime, streamStreamID, streamTerminatedHalfway,
            ] = await proxiedContract.streams(return_streamID)

            expect(partialAmountAbleToClaimSnapShot).to.equal(streamPartialAmountAbleToClaim);
            expect(validClaimAmountSnapShot).to.equal(streamValidClaimAmount);
        });
    });
});
