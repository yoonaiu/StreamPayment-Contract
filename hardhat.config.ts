require('dotenv').config();
require("@nomiclabs/hardhat-ethers");
// require("@nomiclabs/hardhat-etherscan");
// require("@nomicfoundation/hardhat-verify");
require("@nomicfoundation/hardhat-toolbox")

const { API_URL, PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

module.exports = {
  solidity: "0.8.18",
  defaultNetwork: "hardhat",
  networks: {
      hardhat: {},
      'thunder-testnet' : {
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
    timeout: 70000 // set time limit to be 70 sec
  },
};