// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@uniswap/lib/contracts/libraries/SafeERC20Namer.sol';
import '@openzeppelin/contracts/drafts/IERC20Permit.sol';

import '../interfaces/external/IERC1271.sol';
import '../interfaces/external/IERC20PermitAllowed.sol';
import '../base/Multicall.sol';

/// @title Permit Registry
/// @notice Allows anyone to register that a token supports EIP2612 permit, DAI style permit, and ERC1271 signatures
/// @dev This information can be used by interfaces to show different workflows depending on the off-chain signature
/// features that a token supports
contract PermitRegistry is Multicall, IERC1271 {
    /// @notice The possible fields in the domain separator
    enum DomainField {NAME, VERSION, CHAIN_ID, VERIFYING_CONTRACT, SALT}

    /// @notice A list of the fields that are in a domain and their respective abi encoded values
    struct DomainSeparatorComponents {
        DomainField[] fields;
        bytes[] values;
    }

    mapping(address => DomainSeparatorComponents) private _domainSeparatorsComponents;

    /// @notice Each value represents the bit index for which bit in the flags where the information is recorded
    enum PermitFlag {SUPPORTS_EIP2612, SUPPORTS_DAI_PERMIT, HAS_DOMAIN_OVERRIDE, DOMAIN_WITHOUT_VERSION}

    /// @notice Emitted when it is registered that a token supports a specific type of permit
    /// @param token The address of the token for which the permit type was registered
    /// @param flag The address of the token for which the permit type was registered
    event PermitRegistered(address indexed token, PermitFlag indexed flag);

    /// @notice Emitted when the domain details for a token are registered
    /// @param token The address of the token for which the domain was registered
    /// @param name The name used in the EIP712 domain for the permit signature
    /// @param hasVersion Whether the EIP712 domain contains a version string
    /// @param version The version used in the EIP712 domain for the permit signature, or empty string if not applicable
    event DomainRegistered(address indexed token, string name, string version, bool hasVersion);

    /// @dev For each token, the bitmap of booleans containing information about the supported permutations of permit
    mapping(address => uint8) private _flags;

    /// @dev The overridden components of the domain
    struct DomainOverride {
        // the name override
        string name;
        // the version override, if applicable
        string version;
    }
    mapping(address => DomainOverride) private _domainOverrides;

    /// @dev Returns the current chain ID
    function _chainId() private pure returns (uint256 chainId) {
        assembly {
            chainId := chainid()
        }
    }

    /// @dev Returns a uint8 with the bit set for the given flag
    function _flagValue(PermitFlag flag) private returns (uint8) {
        return uint8(1) << uint8(flag);
    }

    /// @dev Returns whether the flag has the given bit set
    function _checkFlag(uint8 flags, PermitFlag flag) private returns (bool) {
        return flags & _flagValue(flag) != 0;
    }

    /// @dev Sets the bit representing the given permit flag to 1 in the flags mapping
    function _addFlag(address token, PermitFlag flag) private {
        _flags[token] |= _flagValue(flag);
        emit PermitRegistered(token, flag);
    }

    /// @notice Returns all information necessary to construct a permit signature for the given token
    /// @dev This information may be incomplete, and is populated only by using the registration functions
    function get(address token)
        external
        view
        returns (
            uint8 flags,
            string memory name,
            bool hasVersion,
            string memory version,
            uint256 chainId
        )
    {
        flags = _flags[token];

        hasVersion = true;
        if (_checkFlag(flags, PermitFlag.HAS_DOMAIN_OVERRIDE)) {
            hasVersion = !_checkFlag(flags, PermitFlag.DOMAIN_WITHOUT_VERSION);
            name = _domainOverrides[token].name;
            if (hasVersion) {
                version = _domainOverrides[token].version;
            }
        } else {
            name = IERC20(token).name();
        }

        chainId = _chainId();
    }

    function encodeValueAsType(DomainField field, bytes memory value) private view returns (bytes32) {
        if (field == DomainField.CHAIN_ID) {
            return abi.decode(value, (bytes32));
        } else if (field == DomainField.NAME || field == DomainField.VERSION) {
            return keccak256(value);
        } else if (field == DomainField.SALT) {
            return abi.decode(value, (bytes32));
        } else if (field == DomainField.VERIFYING_CONTRACT) {
            return bytes32(abi.decode(value, (address)));
        }
        revert();
    }

    function typeToArgument(DomainField field) private view returns (string memory) {
        if (field == DomainField.CHAIN_ID) {
            return 'uint256 chainId';
        } else if (field == DomainField.NAME) {
            return 'string name';
        } else if (field == DomainField.VERSION) {
            return 'string version';
        } else if (field == DomainField.SALT) {
            return 'bytes32 salt';
        } else if (field == DomainField.VERIFYING_CONTRACT) {
            return 'address verifyingContract';
        }
        revert();
    }

    function constructDomainSignature(DomainField[] memory fields) private view returns (string memory) {
        string memory result = 'EIP712Domain(';
        for (uint256 i = 0; i < fields.length; i++) {
            if (i == fields.length - 1) {
                result = abi.encodePacked(result, typeToArgument(fields[i]));
            } else {
                result = abi.encodePacked(result, typeToArgument(fields[i]), ',');
            }
        }
        result = abi.encodePacked(result, ')');
        return result;
    }

    /// @notice Verify if the parameters were used to build a domain separator in a target contract,
    /// and store the domain override if it matches
    function registerDomain(address token, DomainSeparatorComponents calldata domainSeparatorsComponents) public {
        bytes32 domainSeparator =
            keccak256(
                abi.encodePacked(
                    keccak256(constructDomainSignature(domainSeparatorsComponents.fields)),
    // todo: encode arguments in a loop
//                    keccak256(bytes(domainOverride.name)),
//                    keccak256(bytes(domainOverride.version)),
//                    _chainId(),
//                    token
                )
            );

        //        require(domainSeparator == IERC20Permit(token).DOMAIN_SEPARATOR(), 'Mismatched domains');
        //        _domainOverrides[token] = domainOverride;
        //        _addFlag(token, PermitFlag.HAS_DOMAIN_OVERRIDE);
        //        if (!hasVersion) _addFlag(token, PermitFlag.DOMAIN_WITHOUT_VERSION);
        //        emit DomainRegistered(token, domainOverride.name, domainOverride.version, hasVersion);
    }

    /// @dev Use an ERC2612 permit to register if `token` implements it.
    /// The permit should have this contract as the spender, and type(uint256).max as allowance and deadline.
    /// @notice As a precaution, set the allowance back to zero after registering.
    function registerPermit(
        address token,
        address owner,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        require(IERC20(token).allowance(owner, address(this)) == 0, 'Non-zero starting allowance');
        IERC20Permit(token).permit(
            owner,
            address(this),
            /* value= */
            1,
            /* deadline= */
            type(uint256).max,
            v,
            r,
            s
        );
        require(IERC20(token).allowance(owner, address(this)) == 1, 'Permit did not change allowance');
        _addFlag(token, PermitFlag.SUPPORTS_EIP2612);
    }

    /// @notice Registers that a token supports a DAI-style permit
    /// @dev Use an Dai-style permit to register if `token` implements it.
    /// The permit should result in setting the allowance of the `owner` to type(uint256).max
    function registerDaiPermit(
        address token,
        address owner,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) private {
        require(IERC20(token).allowance(owner, address(this)) == 0, 'Non-zero starting allowance');
        uint256 nonce = IERC20Permit(token).nonces(owner);
        IERC20PermitAllowed(token).permit(
            owner,
            address(this),
            nonce,
            /* expiry= */
            type(uint256).max,
            /* allowed= */
            true,
            v,
            r,
            s
        );
        require(IERC20(token).allowance(owner, address(this)) == type(uint256).max, 'Permit unsuccessful');
        _addFlag(token, PermitFlag.SUPPORTS_DAI_PERMIT);
    }
}
