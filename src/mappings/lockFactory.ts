/* eslint-disable prefer-const */
import { BigInt, log } from '@graphprotocol/graph-ts'
import { LockCreated } from '../types/LockFactory/LockFactory'
import { TokenLocker } from '../types/templates/Pair/TokenLocker'
import { Pair } from '../types/schema'
import { Pair as PairTemplate } from '../types/templates'
import {
  ZERO_BD,
  ZERO_BI,
  ADDRESS_ZERO,
  convertTokenToDecimal
} from './helpers'

export function handlePairLockCreated(event: LockCreated): void {
  let pair = Pair.load(event.params.pair.toHexString());
  if (pair === null) {
    pair = new Pair(event.params.pair.toHexString()) as Pair
    pair.token0 = ADDRESS_ZERO
    pair.token1 = ADDRESS_ZERO
    pair.liquidityProviderCount = ZERO_BI
    pair.createdAtTimestamp = event.block.timestamp
    pair.createdAtBlockNumber = event.block.number
    pair.isStable = false
    pair.txCount = ZERO_BI
    pair.reserve0 = ZERO_BD
    pair.reserve1 = ZERO_BD
    pair.trackedReserveETH = ZERO_BD
    pair.reserveETH = ZERO_BD
    pair.reserveUSD = ZERO_BD
    pair.totalSupply = ZERO_BD
    pair.volumeToken0 = ZERO_BD
    pair.volumeToken1 = ZERO_BD
    pair.volumeUSD = ZERO_BD
    pair.untrackedVolumeUSD = ZERO_BD
    pair.token0Price = ZERO_BD
    pair.token1Price = ZERO_BD
    pair.tokenLocker = event.params.tokenLocker.toHexString()
    pair.feeDistributor = event.params.feeDistributor.toHexString()
    const tokenLocker = TokenLocker.bind(event.params.tokenLocker);
    pair.lockerFeesP = convertTokenToDecimal(event.params.lockerFeesP, BigInt.fromI32(2))
    pair.maxLockDays = tokenLocker.MAX_LOCK_DAYS()
    PairTemplate.create(event.params.pair)
  } else {
    pair.tokenLocker = event.params.tokenLocker.toHexString()
    pair.feeDistributor = event.params.feeDistributor.toHexString()
    pair.lockerFeesP = convertTokenToDecimal(event.params.lockerFeesP, BigInt.fromI32(2))
    const tokenLocker = TokenLocker.bind(event.params.tokenLocker)
    pair.maxLockDays = tokenLocker.MAX_LOCK_DAYS()
  }
  
  pair.save()
}
