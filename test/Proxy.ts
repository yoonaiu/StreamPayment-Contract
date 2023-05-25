import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
// import "solidity-coverage"

const sleep = async (sec: number) => {
    await time.increase(sec);
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
});
