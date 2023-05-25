import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv"
dotenv.config()
import "hardhat-gas-reporter"

// require("@nomiclabs/hardhat-ethers");
// require("@nomiclabs/hardhat-etherscan");
// require("@nomicfoundation/hardhat-verify");

const { PRIVATE_KEY } = process.env;

const config: HardhatUserConfig = {
  solidity: "0.8.18",
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    'thunder-testnet': {
      url: 'https://testnet-rpc.thundercore.com',
      chainId: 18,
      gas: 90000000,
      gasPrice: 1e11,
      accounts: [`0x${PRIVATE_KEY}`],
    }
  },
  etherscan: {
    apiKey: {
      "thunder-testnet": "unused",
    },
    customChains: [
      {
        network: "thunder-testnet",
        chainId: 18,
        urls: {
          apiURL: "https://explorer-testnet.thundercore.com/api",
          browserURL: "https://explorer-testnet.thundercore.com",
        },
      }
    ],
  },
  mocha: {
    //parallel: true
  },
};

export default config;