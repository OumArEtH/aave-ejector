import { expect } from 'chai'
import { ethers, network } from 'hardhat'
import { Contract, Signer } from 'ethers'

describe("AaveEjector", () => {
  let deployer: Signer
  let user: Signer

  beforeEach(async () => {
    const [owner] = await ethers.getSigners()
    deployer = owner

    const AaveEjector = await ethers.getContractFactory("AaveEjector")
    const aaveEjector = await AaveEjector.deploy()
    await aaveEjector.deployed()

    // impersonate an account to be used for testing
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: ["0xcA8Fa8f0b631EcdB18Cda619C4Fc9d197c8aFfCa"],
    })

    user = await ethers.getSigner("0xcA8Fa8f0b631EcdB18Cda619C4Fc9d197c8aFfCa")
})

  describe("Deployment", () => {
    it("Should successfully deploy contract", async function () {
      
    })
  })

  describe("Ejection", () => {
    it("Should successfully close all positions", async function () {

    })
  })
})
