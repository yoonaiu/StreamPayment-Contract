import { ethers } from "hardhat";

async function main() {
  const _proxyContract = await ethers.getContractFactory('Proxy');
  const proxyContract = await _proxyContract.deploy();
  console.log(
    `proxyContract deployed to ${proxyContract.address}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
