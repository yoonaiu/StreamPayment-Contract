// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    address public owner;
    address public vip;

    constructor(string memory name, string memory symbol, address vipAddress) ERC20(name, symbol) {
        owner = msg.sender;
        vip = vipAddress;
        _mint(msg.sender, 1000000000000000000000); // initialize 1000 token
    }

    modifier onlyAuthorized() {
        require((msg.sender == owner || msg.sender == vip), "onlyAuthorized can do this action");
        _;
    }

    function mint(address account, uint256 amount) external onlyAuthorized {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external onlyAuthorized {
        _burn(account, amount);
    }

    function transferTokens(address tokenAddress, address recipient, uint256 amount) public {
        IERC20(tokenAddress).approve(msg.sender, amount);
        IERC20(tokenAddress).transferFrom(msg.sender, recipient, amount);
    }
}