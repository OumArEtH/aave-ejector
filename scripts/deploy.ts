import { ethers } from 'hardhat'

async function main() {
  
  const AaveEjector = await ethers.getContractFactory("AaveEjector")
  const aaveEjector = await AaveEjector.deploy()
  await aaveEjector.deployed()

  const network = await ethers.provider.getNetwork()

  console.log("AaveEjector deployed at: %s on network %s", aaveEjector.address, network.name)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })