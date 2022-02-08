import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import * as fs from 'fs'

export const ADDRESS_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
export const ADDRESS_WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
export const ADDRESS_DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F"
export const ADDRESS_YFI = "0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e"
export const ADDRESS_LINK = "0x514910771af9ca656af840dff83e8264ecf986ca"
export const ADDRESS_LENDING_POOL = "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9"
export const ADDRESS_DATA_PROVIDER = "0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d"

export const wethContract = (): Contract => {
    return getContract(ADDRESS_WETH, 'contracts/artifacts/WrappedEther.json')
}

export const daiContract = (): Contract => {
    return getContract(ADDRESS_DAI, 'contracts/artifacts/DAI.json')
}

export const usdcContract = (): Contract => {
    return getContract(ADDRESS_USDC, 'contracts/artifacts/USDC.json')
}

export const linkContract = (): Contract => {
    return getContract(ADDRESS_LINK, 'contracts/artifacts/Chainlink.json')
}

export const yfiContract = (): Contract => {
    return getContract(ADDRESS_YFI, 'contracts/artifacts/YFI.json')
}

export const aLINKContract = (aaveLink: string): Contract => {
    return getContract(aaveLink, 'contracts/artifacts/aToken.json')
}

export const aYFIContract = (aaveYfi: string): Contract => {
    return getContract(aaveYfi, 'contracts/artifacts/aToken.json')
}

export const lendingPoolContract = (): Contract => {
    return getContract(ADDRESS_LENDING_POOL, 'contracts/artifacts/LendingPool.json')
}

export const dataProviderContract = (): Contract => {
    return getContract(ADDRESS_DATA_PROVIDER, 'contracts/artifacts/ProtocolDataProvider.json')
}

export const stableDebtDAIContract = (stableDebtDAI: string): Contract => {
    return getContract(stableDebtDAI, 'contracts/artifacts/StableDebtToken.json')
}

export const stableDebtUSDCContract = (stableDebtUSDC: string): Contract => {
    return getContract(stableDebtUSDC, 'contracts/artifacts/StableDebtToken.json')
}

export const getContract = (address: string, abiLocation: string): Contract => {
    const abi = JSON.parse(fs.readFileSync(abiLocation).toString())
    return new ethers.Contract(address, abi)
}