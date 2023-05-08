import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';
// import "solidity-coverage"

describe('StreamPayment', function () {
    let owner: any;
    let StreamPayment: Contract;
    let ERC20Token: Contract;
    let title: string;
    let payer: any;
    let receiver: any;
    let tokenAddress: any;
    let totalAmount: any;
    let startTime: any;
    let endTime: any;

    beforeEach(async function () {
        // -> owner is the one to deploy following contract -> verified by console.log
        [owner, payer, receiver] = await ethers.getSigners();
        
        const _StreamPayment = await ethers.getContractFactory('StreamPayment');
        StreamPayment = await _StreamPayment.deploy();

        const _ERC20Token = await ethers.getContractFactory("TestToken");
        ERC20Token = await _ERC20Token.deploy("TestToken", "TEST");        // the parameter to the contract constructor

        // set up the "valid" parameter
        title = "test transfer title";
        tokenAddress = ERC20Token.address;
        totalAmount = 100;
        startTime = Date.now() + 10;  // uint in second
        endTime = Date.now() + 10000;
    });

    describe("StreamPayment createStream", function () {
        it("startTime should be later than block.timestamp", async function () {
            await expect(StreamPayment.connect(payer).createStream(title, 
                                                                    payer,
                                                                    receiver,
                                                                    tokenAddress,
                                                                    totalAmount,
                                                                    Date.now() - 100,
                                                                    endTime)).to.be.revertedWith("Start time is in the past");
        });

        it("endTime should be later than block.timestamp", async function () {
            await expect(StreamPayment.connect(payer).createStream(title, 
                                                                    payer,
                                                                    receiver,
                                                                    tokenAddress,
                                                                    totalAmount,
                                                                    startTime,
                                                                    Date.now() - 100)).to.be.revertedWith("End time is in the past");
        });

        it("endTime should not equal to startTime", async function () {
            await expect(StreamPayment.connect(payer).createStream(title, 
                                                                    payer,
                                                                    receiver,
                                                                    tokenAddress,
                                                                    totalAmount,
                                                                    Date.now(),
                                                                    Date.now())).to.be.revertedWith("End time should be later than start time");
        });

        it("endTime should be later than startTime", async function () {
            await expect(StreamPayment.connect(payer).createStream(title, 
                                                                    payer,
                                                                    receiver,
                                                                    tokenAddress,
                                                                    totalAmount,
                                                                    Date.now(),
                                                                    Date.now() - 100)).to.be.revertedWith("End time should be later than start time");
        });

        it("payer address should not be zero address", async function () {
            await expect(StreamPayment.connect(payer).createStream(title, 
                                                                    0x0,
                                                                    receiver,
                                                                    tokenAddress,
                                                                    totalAmount,
                                                                    startTime,
                                                                    endTime)).to.be.revertedWith("payer address should not be zero address");
        });
        
        it("receiver address should not be zero address", async function () {
            await expect(StreamPayment.connect(payer).createStream(title, 
                                                                    payer,
                                                                    0x0,
                                                                    tokenAddress,
                                                                    totalAmount,
                                                                    startTime,
                                                                    endTime)).to.be.revertedWith("receiver address should not be zero address");
        });

        it("Payer should not be the same as receiver", async function () {
            await expect(StreamPayment.connect(payer).createStream(title, 
                                                                    payer,
                                                                    payer,
                                                                    tokenAddress,
                                                                    totalAmount,
                                                                    startTime,
                                                                    endTime)).to.be.revertedWith("Payer should not be the same as receiver");
        });


        it("Transfer amount of the token should be greater than zero", async function () {
            await expect(StreamPayment.connect(payer).createStream(title, 
                                                                    payer,
                                                                    receiver,
                                                                    tokenAddress,
                                                                    0,
                                                                    startTime,
                                                                    endTime)).to.be.revertedWith("Transfer amount of the token should be greater than zero");
        });


        it("Token address should be a valid ERC20 token", async function () {
            await expect(StreamPayment.connect(payer).createStream(title, 
                                                                    payer,
                                                                    receiver,
                                                                    0x0,
                                                                    totalAmount,
                                                                    startTime,
                                                                    endTime)).to.be.revertedWith("Token address is not a valid ERC20 token");
        });


        it("Payer should not createStream without enough token amount", async function () {
            await expect(StreamPayment.connect(payer).createStream(title, 
                                                                    payer,
                                                                    receiver,
                                                                    tokenAddress,
                                                                    totalAmount,
                                                                    startTime,
                                                                    endTime)).to.be.revertedWith("The payer's token amount is not enough to create the stream");
        });


        it("Payer should successfully createStream with valid parameters and add correct stream record into the contract", async function () {
            expect(await ERC20Token.balanceOf(StreamPayment.address)).to.equal(0);
            await ERC20Token.transfer(payer, 1000);     
            await ERC20Token.connect(payer).approve(StreamPayment.address, 100);
            let return_streamID = await ERC20Token.connect(payer).createStream(title, 
                                                                                payer,
                                                                                receiver,
                                                                                tokenAddress,
                                                                                totalAmount,
                                                                                startTime,
                                                                                endTime);
            expect(await ERC20Token.balanceOf(StreamPayment.address)).to.equal(100);

            expect(await StreamPayment.streams[return_streamID].title).to.equal(title);
            expect(await StreamPayment.streams[return_streamID].payer).to.equal(payer);
            expect(await StreamPayment.streams[return_streamID].receiver).to.equal(receiver);
            expect(await StreamPayment.streams[return_streamID].tokenAddress).to.equal(tokenAddress);
            expect(await StreamPayment.streams[return_streamID].claimedAmount).to.equal(0);
            expect(await StreamPayment.streams[return_streamID].startTime).to.equal(startTime);
            expect(await StreamPayment.streams[return_streamID].endTime).to.equal(endTime);
            expect(await StreamPayment.streams[return_streamID].streamID).to.equal(return_streamID);
        });
        
    });
});
