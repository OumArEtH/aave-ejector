import { expect } from 'chai'
import { ethers, network } from 'hardhat'
import { Contract, Signer } from 'ethers'
import { 
    wethContract, 
    daiContract, 
    usdcContract, 
    linkContract, 
    yfiContract,
    USDC,
    DAI, 
    YFI, 
    LINK,  
    WETH } from './contracts'
import * as fs from 'fs'

describe("AssetSwapper", () => {
  let deployer: Signer
  let user: Signer
  let assetSwapper: Contract
  const userAddress = "0xcA8Fa8f0b631EcdB18Cda619C4Fc9d197c8aFfCa"

  beforeEach(async () => {
    const [owner] = await ethers.getSigners()
    deployer = owner

    const routerAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564"

    const AssetSwapper = await ethers.getContractFactory("AssetSwapper")
    assetSwapper = await AssetSwapper.deploy(routerAddress)
    await assetSwapper.deployed()

    // impersonate an account to be used for testing
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [userAddress],
    })

    user = await ethers.getSigner(userAddress)

    // First deposit some ETH to get WETH
    const weth = wethContract()
    await weth.connect(user).deposit({ value: ethers.utils.parseEther("100") })

    // approve assetSwapper to spend WETH
    await weth.connect(user).approve(assetSwapper.address, ethers.utils.parseEther("100"))
  })

  describe("Swap", () => {
    it("Should successfully swap fixed input tokens", async function () {        
        await assetSwapper.connect(user).swapExactInput(
            WETH, 
            ethers.utils.parseEther("1"), 
            DAI, 
            ethers.utils.parseEther("1"))

        const dai = daiContract()
        const daiBalance = await dai.connect(user).balanceOf(userAddress)

        console.log(ethers.utils.formatEther(daiBalance.toString()))

        await assetSwapper.connect(user).swapExactInput(
            WETH, 
            ethers.utils.parseEther("1"), 
            USDC, 
            ethers.utils.parseUnits("1", 6))

        const usdc = usdcContract()
        const usdcBalance = await usdc.connect(user).balanceOf(userAddress)

        console.log(ethers.utils.formatUnits(usdcBalance.toString(), 6))
    })

    it("Should successfully swap with fixed output", async function () {
        const weth = wethContract()

        // Get some initial tokens that will be sold later for ETH, just testing purposes
        await assetSwapper.connect(user).swapExactInput(
            WETH, 
            ethers.utils.parseEther("10"), 
            YFI, 
            ethers.utils.parseEther("1"))

        const yfi = yfiContract()
        const yfiBalance = await yfi.connect(user).balanceOf(userAddress)

        console.log(ethers.utils.formatEther(yfiBalance.toString()))

        await assetSwapper.connect(user).swapExactInput(
            WETH, 
            ethers.utils.parseEther("1"), 
            LINK, 
            ethers.utils.parseEther("1"))

        const link = linkContract()
        const linkBalance = await link.connect(user).balanceOf(userAddress)

        console.log(ethers.utils.formatEther(linkBalance.toString()))

        let balance = await weth.connect(user).balanceOf(userAddress)
        console.log("WETH balance after first two swaps: ", ethers.utils.formatEther(balance.toString()))
        
        // swap for exact ETH output

        // approve assetSwapper to spend LINK
        await link.connect(user).approve(assetSwapper.address, ethers.utils.parseEther("210"))
        
        await assetSwapper.connect(user).swapExactOutput(
            LINK, 
            ethers.utils.parseEther("210"), 
            WETH, 
            ethers.utils.parseEther("0.8"))

        balance = await weth.connect(user).balanceOf(userAddress)
        console.log("WETH balance after LINK swap: ", ethers.utils.formatEther(balance.toString()))

        // approve assetSwapper to spend YFI
        await yfi.connect(user).approve(assetSwapper.address, ethers.utils.parseEther("1"))
        
        await assetSwapper.connect(user).swapExactOutput(
            YFI, 
            ethers.utils.parseEther("1"), 
            WETH, 
            ethers.utils.parseEther("6"))

        balance = await weth.connect(user).balanceOf(userAddress)
        console.log("WETH balance after YFI swap: ", ethers.utils.formatEther(balance.toString()))
    })
  })
})
