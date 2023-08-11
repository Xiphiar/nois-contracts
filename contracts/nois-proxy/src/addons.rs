use cosmwasm_std::{Addr, DepsMut, Response, Env, MessageInfo, ensure_eq};
use cw_storage_plus::Map;

use crate::{error::ContractError, state::{CONFIG, ALLOWLIST_MARKER}, attributes::ATTR_ACTION};

/// List of addresses allowed to get randomness without payment. To decide
/// if an address is allowed, we consider only whether the address is present as
/// a key. The u8 value itself is a dummy value.
pub const PAYMENT_WHITELIST: Map<&Addr, u8> = Map::new("payment_whitelist");

/// List of addresses allowed to edit payment whitelist. To decide
/// if an address is allowed, we consider only whether the address is present as
/// a key. The u8 value itself is a dummy value.
pub const OPERATORS: Map<&Addr, u8> = Map::new("operators");


pub fn execute_update_payment_whitelist(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    add_addresses: Vec<String>,
    remove_addresses: Vec<String>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // If the caller is not an operator, and if manager set,
    // check the calling address is the manager, otherwise error unauthorized
    if !OPERATORS.has(deps.storage, &info.sender) {
        ensure_eq!(
            info.sender,
            config.manager.as_ref().ok_or(ContractError::Unauthorized)?,
            ContractError::Unauthorized
        );
    }

    update_payment_whitelist(deps, add_addresses, remove_addresses)?;
    Ok(Response::new().add_attribute(ATTR_ACTION, "execute_update_payment_whitelist"))
}

/// Adds and remove entries from the payment whitelist.
fn update_payment_whitelist(
    deps: DepsMut,
    add_addresses: Vec<String>,
    remove_addresses: Vec<String>,
) -> Result<(), ContractError> {
    for addr in add_addresses {
        let addr = deps.api.addr_validate(addr.as_str())?;
        PAYMENT_WHITELIST.save(deps.storage, &addr, &ALLOWLIST_MARKER)?;
    }

    for addr in remove_addresses {
        let addr = deps.api.addr_validate(addr.as_str())?;
        PAYMENT_WHITELIST.remove(deps.storage, &addr);
    }
    Ok(())
}



pub fn execute_update_operators(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    add_addresses: Vec<String>,
    remove_addresses: Vec<String>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // if manager set, check the calling address is the authorised multisig otherwise error unauthorised
    ensure_eq!(
        info.sender,
        config.manager.as_ref().ok_or(ContractError::Unauthorized)?,
        ContractError::Unauthorized
    );

    update_operators(deps, add_addresses, remove_addresses)?;
    Ok(Response::new().add_attribute(ATTR_ACTION, "execute_update_operators"))
}


/// Adds and remove entries from the payment whitelist.
fn update_operators(
    deps: DepsMut,
    add_addresses: Vec<String>,
    remove_addresses: Vec<String>,
) -> Result<(), ContractError> {
    for addr in add_addresses {
        let addr = deps.api.addr_validate(addr.as_str())?;
        OPERATORS.save(deps.storage, &addr, &ALLOWLIST_MARKER)?;
    }

    for addr in remove_addresses {
        let addr = deps.api.addr_validate(addr.as_str())?;
        OPERATORS.remove(deps.storage, &addr);
    }
    Ok(())
}