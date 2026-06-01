import { AbiCoder, dataSlice, getAddress, id, keccak256, toBeHex, zeroPadValue } from "ethers";
import type { Access, PlannedTransaction } from "./types.js";

const TRANSFER = id("transfer(address,uint256)").slice(0, 10);
const TRANSFER_FROM = id("transferFrom(address,address,uint256)").slice(0, 10);
const APPROVE = id("approve(address,uint256)").slice(0, 10);
const BALANCE_OF = id("balanceOf(address)").slice(0, 10);
const ALLOWANCE = id("allowance(address,address)").slice(0, 10);

const coder = AbiCoder.defaultAbiCoder();

export function inferCommonErc20Access(tx: PlannedTransaction): Access[] {
  if (!tx.to || !tx.data || tx.data.length < 10) {
    return [];
  }

  const selector = tx.data.slice(0, 10).toLowerCase();
  const contract = normalizeAddress(tx.to);

  try {
    if (selector === TRANSFER) {
      if (!tx.from) return [];
      const [recipient] = coder.decode(["address", "uint256"], dataSlice(tx.data, 4));
      return [
        balanceAccess(contract, tx.from, "write", "ERC-20 transfer debits sender balance"),
        balanceAccess(contract, String(recipient), "write", "ERC-20 transfer credits recipient balance")
      ];
    }

    if (selector === TRANSFER_FROM) {
      if (!tx.from) return [];
      const [owner, recipient] = coder.decode(["address", "address", "uint256"], dataSlice(tx.data, 4));
      return [
        balanceAccess(contract, String(owner), "write", "ERC-20 transferFrom debits owner balance"),
        balanceAccess(contract, String(recipient), "write", "ERC-20 transferFrom credits recipient balance"),
        allowanceAccess(contract, String(owner), tx.from, "write", "ERC-20 transferFrom consumes allowance")
      ];
    }

    if (selector === APPROVE) {
      if (!tx.from) return [];
      const [spender] = coder.decode(["address", "uint256"], dataSlice(tx.data, 4));
      return [
        allowanceAccess(contract, tx.from, String(spender), "write", "ERC-20 approve writes allowance")
      ];
    }

    if (selector === BALANCE_OF) {
      const [owner] = coder.decode(["address"], dataSlice(tx.data, 4));
      return [balanceAccess(contract, String(owner), "read", "ERC-20 balanceOf reads owner balance")];
    }

    if (selector === ALLOWANCE) {
      const [owner, spender] = coder.decode(["address", "address"], dataSlice(tx.data, 4));
      return [allowanceAccess(contract, String(owner), String(spender), "read", "ERC-20 allowance reads allowance")];
    }
  } catch {
    return [];
  }

  return [];
}

function balanceAccess(contract: string, owner: string, mode: "read" | "write", reason: string): Access {
  return {
    contract,
    slot: `erc20.balance:${normalizeAddress(owner)}:${mappingSlot(owner, 0)}`,
    mode,
    reason
  };
}

function allowanceAccess(contract: string, owner: string, spender: string, mode: "read" | "write", reason: string): Access {
  return {
    contract,
    slot: `erc20.allowance:${normalizeAddress(owner)}:${normalizeAddress(spender)}:${nestedMappingSlot(owner, spender, 1)}`,
    mode,
    reason
  };
}

function mappingSlot(key: string, slot: number | bigint): string {
  const encoded = zeroPadValue(normalizeAddress(key), 32) + zeroPadValue(toBeHex(slot), 32).slice(2);
  return keccak256(encoded);
}

function nestedMappingSlot(outerKey: string, innerKey: string, slot: number): string {
  return mappingSlot(innerKey, BigInt(mappingSlot(outerKey, slot)));
}

function normalizeAddress(address: string): string {
  return getAddress(address);
}
