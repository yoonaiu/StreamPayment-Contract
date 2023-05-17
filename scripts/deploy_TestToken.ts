import { ethers } from "hardhat";

async function main() {
  const _TestToken = await ethers.getContractFactory('TestToken');
  const TestToken = await _TestToken.deploy("TestToken", "TT", "0x21Ce00020edF2A426B557eF63C3D455c9d002Cd1");
  await TestToken.deployed();

  console.log(
    `TestToken deployed to ${TestToken.address}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
