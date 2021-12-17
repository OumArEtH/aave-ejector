// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import { IFlashLoanReceiver, ILendingPoolAddressesProvider, ILendingPool, IPriceOracle, IERC20 } from "./Interfaces.sol";
import { SafeMath, SafeERC20, DataTypes } from "./Libraries.sol";

contract AaveEjector is IFlashLoanReceiver {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    
    struct UserLendingData {
        address[] collateralAssets;
        uint256[] collatoralAssetsPrices;
    }
    
    // Tokens
    address internal constant DAI_TOKEN = address(0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD);
    address internal constant YFI_TOKEN = address(0xb7c325266ec274fEb1354021D27FA3E3379D840d);
    address internal constant LINK_TOKEN = address(0xAD5ce863aE3E4E9394Ab43d4ba0D80f419F61789);
    address internal constant USDC_TOKEN = address(0xe22da380ee6B445bb8273C81944ADEB6E8450422);
    
    // Lending parameters
    uint16 internal constant INTEREST_RATE_MODE = 1;
    uint16 internal constant FLASH_LOAN_DEBT_MODE = 0;
    uint16 internal constant REFERRAL_CODE = 0;
    
    ILendingPoolAddressesProvider public addressesProvider;
    ILendingPool public lendingPool;
    IPriceOracle public priceOracle;
    
    address public onBehalfOf;
    address public owner;
    
    event Log(string name, uint256 value);
    event FLAssets(string name, address asset, uint256 value);

    error Unauthorized();
    
    constructor() {
        owner = msg.sender;
        addressesProvider = ILendingPoolAddressesProvider(address(0x88757f2f99175387aB4C6a4b3067c77A695b0349));
        lendingPool = ILendingPool(addressesProvider.getLendingPool());
        priceOracle = IPriceOracle(addressesProvider.getPriceOracle());
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
        for (uint i = 0; i < assets.length; i++) {
            repayDebt(assets[i], amounts[i]);
        }
        
        uint256 _totalCollateralETH = _getTotalCollateralETHValue(onBehalfOf);
        
        emit Log("Total Collacteral ETH", _totalCollateralETH);

        UserLendingData memory userLendingData;
        
        userLendingData.collateralAssets = _getCollaterals(onBehalfOf);
        userLendingData.collatoralAssetsPrices = new uint256[](userLendingData.collateralAssets.length);

        for (uint i = 0; i < userLendingData.collateralAssets.length; i++) {
            address collacteralAsset = address(userLendingData.collateralAssets[i]);
            
            userLendingData.collatoralAssetsPrices[i] = priceOracle.getAssetPrice(collacteralAsset);

            // Withdraw collateral from lending pool
            _withdraw(collacteralAsset, type(uint).max);
            
            // swap collateral to ETH
        }
        
        for (uint i = 0; i < assets.length; i++) {
            uint amountToTransfer = amounts[i].add(premiums[i]);
            emit FLAssets("Amount to transfer", assets[i], amountToTransfer);
        }
        

        // At the end of your logic above, this contract owes
        // the flashloaned amounts + premiums.
        // Therefore ensure your contract has enough to repay
        // these amounts.

        // Approve the LendingPool contract allowance to *pull* the owed amount
        for (uint i = 0; i < assets.length; i++) {
            uint amountOwing = amounts[i].add(premiums[i]);
            IERC20(assets[i]).approve(address(lendingPool), amountOwing);
        }

        return true;
    }
    
    function setupDeposit() public {
        deposit(LINK_TOKEN, IERC20(LINK_TOKEN).balanceOf(address(this)));
        deposit(YFI_TOKEN, IERC20(YFI_TOKEN).balanceOf(address(this)));
    }
    
    function setupBorrow() public {
        borrow(DAI_TOKEN, 1000000000000000000000);
        borrow(USDC_TOKEN, 1000000000);
    }
    
    function withdrawDebt() public {
        IERC20(DAI_TOKEN).transferFrom(address(this), msg.sender, IERC20(DAI_TOKEN).balanceOf(address(this)));
        IERC20(USDC_TOKEN).transferFrom(address(this), msg.sender, IERC20(USDC_TOKEN).balanceOf(address(this)));
    }
    
    function approveSpending(uint256 _amount) public {
        require(IERC20(USDC_TOKEN).approve(address(this), _amount));
        require(IERC20(DAI_TOKEN).approve(address(this), _amount));
    }
    
    function allowance(address _asset, address spender) public view returns(uint256) {
        return IERC20(_asset).allowance(msg.sender, spender);
    }
    
    function testTransfer(address _asset, uint256 _amount) public {
        require(IERC20(_asset)
            .transferFrom(address(0x6F2ded3Cbf4E63Ff3636E3f946E0924E4c79B474), address(this), _amount));
    }
    
    function closePosition() public {
        address[] memory assets = new address[](2);
        assets[0] = DAI_TOKEN;
        assets[1] = USDC_TOKEN;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1100000000000000000000;
        amounts[1] = 1100000000;

        // 0 = no debt, 1 = stable, 2 = variable
        uint256[] memory modes = new uint256[](2);
        modes[0] = FLASH_LOAN_DEBT_MODE;
        modes[1] = FLASH_LOAN_DEBT_MODE;
        
        _takeLoan(assets, amounts, modes);
    }

    function _takeLoan(address[] memory assets, uint256[] memory amounts, uint256[] memory modes) public {
        address receiverAddress = address(this);
        bytes memory params = "";
        uint16 referralCode = 0;

        lendingPool.flashLoan(
            receiverAddress,
            assets,
            amounts,
            modes,
            onBehalfOf,
            params,
            referralCode
        );
    }
    
    function deposit(address _asset, uint256 _amount) public {
        require(IERC20(_asset).approve(address(lendingPool), _amount), "Deposit - Lending provider approval failed");
        
        lendingPool.deposit(_asset, _amount, onBehalfOf, REFERRAL_CODE);
    }
    
    function borrow(address _asset, uint256 _amount) public {
        lendingPool.borrow(_asset, _amount, INTEREST_RATE_MODE, REFERRAL_CODE, onBehalfOf);
    }
    
    function getUserConfiguration(address _user) public view returns(uint256) {
        DataTypes.UserConfigurationMap memory userConfig = lendingPool.getUserConfiguration(_user);
        return userConfig.data;
    }
    
    function getReservesList() public view returns(address[] memory) {
        return lendingPool.getReservesList();
    }
    
    function changeOnBehalfOf(address newOnBehalfOf) public onlyOwner {
        onBehalfOf = newOnBehalfOf;
    }
    
    function _getTotalCollateralETHValue(address _user) internal view returns(uint256) {
        (uint256 _totalCollateralETH, 
        uint256 _a, 
        uint256 _b, 
        uint256 _c, 
        uint256 _d, 
        uint256 _e) = lendingPool.getUserAccountData(_user);
        
        return _totalCollateralETH;
    }
    
    function _getCollaterals(address _user) internal view returns(address[] memory) {
        address[] memory reserveList = lendingPool.getReservesList();
        uint256 collateralsSize;
        uint256 collateralsArrayIndex;
        
        for(uint i = 0; i < reserveList.length; i++) {
            if(_isUsingAsCollateral(_user, i)) {
                collateralsSize++;
            }
        }
        
        address[] memory collaterals = new address[](collateralsSize);
        
        // Unfortunately I had to use two loops to have an array with the exact required size
        for(uint i = 0; i < reserveList.length; i++) {
            if(_isUsingAsCollateral(_user, i)) {
                collaterals[collateralsArrayIndex] = reserveList[i];
                collateralsArrayIndex++;
            }
        }
        
        return collaterals;
    }
    
    function _isUsingAsCollateral(address _user, uint256 reserveIndex) internal view returns (bool) {
        require(reserveIndex < 128, "Invalid index");
        
        DataTypes.UserConfigurationMap memory userConfig = lendingPool.getUserConfiguration(_user);
        return (userConfig.data >> (reserveIndex * 2 + 1)) & 1 != 0;
    }
    
    function repayDebt(address _asset, uint256 _amount) public {
        require(IERC20(_asset).approve(address(lendingPool), _amount), "Repay - Lending provider approval failed");
        
        lendingPool.repay(_asset, _amount, INTEREST_RATE_MODE, onBehalfOf);
    }
    
    function _withdraw(address _asset, uint256 _amount) internal {
        lendingPool.withdraw(_asset, _amount, onBehalfOf);
    }
    
    receive() payable external {}
}