import { ethers } from "hardhat";

async function main() {
  const _StreamPayment = await ethers.getContractFactory('StreamPayment');
  const StreamPayment = await _StreamPayment.deploy();
  console.log(
    `StreamPayment deployed to ${StreamPayment.address}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
