# Aave Ejector

This project demonstrates how one can close an AAVE position with multiple collateral and borrow asset types.
Example using flash loan.
- take out a flash loan of the borrowed asset
- repay back the asset and release the collateral asset
- exchange to needed amount of collateral asset to repay back the flashloan
- take the rest of the collateral back
