import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import * as fs from 'fs'

export const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
export const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
export const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F"
export const YFI = "0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e"
export const LINK = "0x514910771af9ca656af840dff83e8264ecf986ca"

export const wethContract = (): Contract => {
    return getContract(WETH, 'contracts/artifacts/WrappedEther.json')
}

export const daiContract = (): Contract => {
    return getContract(DAI, 'contracts/artifacts/DAI.json')
}

export const usdcContract = (): Contract => {
    return getContract(USDC, 'contracts/artifacts/USDC.json')
}

export const linkContract = (): Contract => {
    return getContract(LINK, 'contracts/artifacts/Chainlink.json')
}

export const yfiContract = (): Contract => {
    return getContract(YFI, 'contracts/artifacts/YFI.json')
}

const getContract = (address: string, abiLocation: string): Contract => {
    const abi = JSON.parse(fs.readFileSync(abiLocation).toString())
    return new ethers.Contract(address, abi)
}