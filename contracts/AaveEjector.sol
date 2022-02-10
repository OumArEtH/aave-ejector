// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import { 
    IFlashLoanReceiver, 
    ILendingPoolAddressesProvider, 
    ILendingPool, 
    IPriceOracle, 
    IERC20, 
    IProtocolDataProvider,
    IStableDebtToken,
    IAToken,
    IAssetSwapper
} from "./Interfaces.sol";

import { SafeMath, SafeERC20, DataTypes } from "./Libraries.sol";

contract AaveEjector is IFlashLoanReceiver {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    address internal constant AAVE_LENDING_POOL_ADDRESSESS_PROVIDER = 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5;
    address internal constant PROTOCOL_DATA_PROVIDER = 0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d;
    address internal constant SWAP_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    
    // Lending parameters
    uint16 internal constant INTEREST_RATE_MODE_STABLE = 1;
    uint16 internal constant FLASH_LOAN_DEBT_MODE_NO_DEBT = 0;
    uint16 internal constant NO_REFERRAL_CODE = 0;
    
    ILendingPoolAddressesProvider public addressesProvider;
    ILendingPool public lendingPool;
    IPriceOracle public priceOracle;
    IProtocolDataProvider public dataProvider;
    
    address public owner;
    address public assetSwapper;

    error Unauthorized();
    
    constructor(address _assetSwapper) {
        owner = msg.sender;
        addressesProvider = ILendingPoolAddressesProvider(AAVE_LENDING_POOL_ADDRESSESS_PROVIDER);
        lendingPool = ILendingPool(addressesProvider.getLendingPool());
        priceOracle = IPriceOracle(addressesProvider.getPriceOracle());
        dataProvider = IProtocolDataProvider(PROTOCOL_DATA_PROVIDER);
        assetSwapper = _assetSwapper;
    }
    
    modifier onlyOwner() {
        if (msg.sender != owner)
            revert Unauthorized();
        _;
    }

    /**
        This function is called after your contract has received the flash loaned amount
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    )
        external
        override
        returns (bool)
    {

        //
        // This contract now has the funds requested.
        // Your logic goes here.
        //
        require(msg.sender == address(lendingPool), "Not callable directly");

        address onBehalfOf = abi.decode(params, (address));

        for (uint i = 0; i < assets.length; i++) {
            repayDebtOnBehalfOf(onBehalfOf, assets[i], amounts[i]);
        }
        
        address[] memory collaterals = _getCollaterals(onBehalfOf);        

        for (uint i = 0; i < collaterals.length; i++) {
            address collacteralAsset = collaterals[i];
            
            // Withdraw collateral from lending pool
            withdrawOnBehalfOf(onBehalfOf, collacteralAsset, type(uint).max);
            
            // swap collateral to ETH
            uint256 balance = IERC20(collacteralAsset).balanceOf(address(this));
            IERC20(collacteralAsset).approve(assetSwapper, balance);

            uint256 assetPrice = priceOracle.getAssetPrice(collacteralAsset);
            uint256 totalAssetValue = balance.div(10 ** IERC20(collacteralAsset).decimals()).mul(assetPrice);

            // 5% slippage
            uint256 minWETHOutput = totalAssetValue.mul(95).div(100);
            
            // swap to WETH
            IAssetSwapper(assetSwapper).swapExactInput(collacteralAsset, balance, WETH, minWETHOutput);
        }

        uint256 wethBalance = IERC20(WETH).balanceOf(address(this));
        IERC20(WETH).approve(assetSwapper, wethBalance);

        // swap WETH to assets to repay back the flash loan
        for (uint i = 0; i < assets.length; i++) {
            // contract owes the flashloaned amounts + premiums
            uint amountOwing = amounts[i].add(premiums[i]);

            // Approve the LendingPool contract allowance to *pull* the owed amount
            IERC20(assets[i]).approve(address(lendingPool), amountOwing);

            address asset = assets[i];
            uint256 assetPrice = priceOracle.getAssetPrice(asset);
            uint256 maxInValue = amountOwing.div(10 ** IERC20(asset).decimals()).mul(assetPrice);

            // 5% slippage
            maxInValue = maxInValue.add(maxInValue.mul(5).div(100));

            // swap back to 'asset' to pay back loan
            IAssetSwapper(assetSwapper).swapExactOutput(WETH, maxInValue, asset, amountOwing);
        }

        return true;
    }

    function takeLoanAndSelfLiquidate(address user) public {
        address receiverAddress = address(this);
        bytes memory params = abi.encode(user);

        address[] memory borrowedAssets = _getBorrowedAssets(user);
        uint256[] memory borrowedBalances = new uint256[](borrowedAssets.length);
        // 0 = no debt, 1 = stable, 2 = variable
        uint256[] memory modes = new uint256[](borrowedAssets.length);

        for(uint i = 0; i < borrowedAssets.length; i++) {
            borrowedBalances[i] = _getBorrowedAssetBalance(borrowedAssets[i], user);
            borrowedBalances[i] = borrowedBalances[i].add(borrowedBalances[i].div(1000));
            modes[i] = FLASH_LOAN_DEBT_MODE_NO_DEBT;
        }

        lendingPool.flashLoan(
            receiverAddress,
            borrowedAssets,
            borrowedBalances,
            modes,
            receiverAddress,
            params,
            NO_REFERRAL_CODE
        );
    }
    
    function depositOnBehalfOf(address onBehalfOf, address asset, uint256 amount) public {
        require(IERC20(asset).approve(address(lendingPool), amount), "Deposit - Lending provider approval failed");
        
        lendingPool.deposit(asset, amount, onBehalfOf, NO_REFERRAL_CODE);
    }
    
    function borrowOnBehalfOf(address onBehalfOf, address asset, uint256 amount) public {
        lendingPool.borrow(asset, amount, INTEREST_RATE_MODE_STABLE, NO_REFERRAL_CODE, onBehalfOf);
    }

    function repayDebtOnBehalfOf(address onBehalfOf, address asset, uint256 amount) public {
        require(IERC20(asset).approve(address(lendingPool), amount), "Repay - Lending provider approval failed");
        
        lendingPool.repay(asset, amount, INTEREST_RATE_MODE_STABLE, onBehalfOf);
    }

    function withdrawOnBehalfOf(address onBehalfOf, address asset, uint256 amount) public {
        (address aToken,,) = dataProvider.getReserveTokensAddresses(asset);
        uint256 balance = IAToken(aToken).balanceOf(onBehalfOf);
        require(IAToken(aToken).transferFrom(onBehalfOf, address(this), balance), "Unable to transfer aToken");

        lendingPool.withdraw(asset, amount, address(this));
    }

    function withdrawFundsToUser(address asset, uint256 amount) public {
        require(IERC20(asset).balanceOf(address(this)) >= amount, "Not enough balance to withdraw from");
        IERC20(asset).transfer(msg.sender, amount);
    }

    /**
        Aave help functions
     */
    
    function _getCollaterals(address user) internal view returns (address[] memory) {
        address[] memory reserveList = lendingPool.getReservesList();
        uint256 collateralsSize;
        uint256 collateralsArrayIndex;
        
        for(uint i = 0; i < reserveList.length; i++) {
            if(_isUsingAsCollateral(user, i)) {
                collateralsSize++;
            }
        }
        
        // need number of collateral assets to initialize result size
        address[] memory collaterals = new address[](collateralsSize);
        
        // Unfortunately I had to use two loops to have an array with the exact required size
        for(uint i = 0; i < reserveList.length; i++) {
            if(_isUsingAsCollateral(user, i)) {
                collaterals[collateralsArrayIndex] = reserveList[i];
                collateralsArrayIndex++;
            }
        }
        
        return collaterals;
    }

    function _getBorrowedAssets(address user) internal view returns (address[] memory) {
        address[] memory reserveList = lendingPool.getReservesList();
        uint256 borrowedAssetsSize;
        uint256 index;
        
        for(uint i = 0; i < reserveList.length; i++) {
            if(_isBorrowing(user, i)) {
                borrowedAssetsSize++;
            }
        }
        
        // need number of borrowed assets to initialize result size
        address[] memory debtAssets = new address[](borrowedAssetsSize);
        
        // Unfortunately I had to use two loops to have an array with the exact required size
        for(uint i = 0; i < reserveList.length; i++) {
            if(_isBorrowing(user, i)) {
                debtAssets[index] = reserveList[i];
                index++;
            }
        }
        
        return debtAssets;
    }

    function _getBorrowedAssetBalance(address asset, address user) internal view returns (uint256) {
        (, address stableDebtToken, address variableDebtToken) = dataProvider.getReserveTokensAddresses(asset);
        uint256 compoundedBalance = IERC20(stableDebtToken).balanceOf(user);
        compoundedBalance = compoundedBalance.add(IERC20(variableDebtToken).balanceOf(user));

        return compoundedBalance;
    }
    
    function _isUsingAsCollateral(address user, uint256 reserveIndex) internal view returns (bool) {
        require(reserveIndex < 128, "Invalid index");
        
        DataTypes.UserConfigurationMap memory userConfig = lendingPool.getUserConfiguration(user);
        return (userConfig.data >> (reserveIndex * 2 + 1)) & 1 != 0;
    }

    function _isBorrowing(address user, uint256 reserveIndex) internal view returns (bool) {
        require(reserveIndex < 128, "Invalid index");
        DataTypes.UserConfigurationMap memory userConfig = lendingPool.getUserConfiguration(user);

        return (userConfig.data >> (reserveIndex * 2)) & 1 != 0;
    }
    
    receive() payable external {}
}