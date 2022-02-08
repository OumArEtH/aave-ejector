import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-ethers";

import * as dotenv from 'dotenv';
import { HardhatUserConfig } from 'hardhat/config';

dotenv.config();

const { DEPLOYER_PRIVATE_KEY, INFURA_API_KEY, ETHERSCAN_API_KEY, ALCHEMY_API_KEY } = process.env;

const config: HardhatUserConfig = {
  solidity: "0.8.4",
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
      }
    },
    main: {
      url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [`0x${DEPLOYER_PRIVATE_KEY}`]
    },
    localhost: {
      url: `http://127.0.0.1:8545`,
    },
  },
  etherscan: {
    apiKey: `${ETHERSCAN_API_KEY}`
  }
};

export default config;