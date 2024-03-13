/* eslint-disable prefer-const */
import { Pair, Token, Bundle } from '../types/schema'
import { BigDecimal, Address, BigInt } from '@graphprotocol/graph-ts/index'
import { ZERO_BD, factoryContract, ADDRESS_ZERO, ONE_BD, UNTRACKED_PAIRS } from './helpers'

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'
const USDC_WETH_PAIR_VOLATILE = '0x9f5fb8504edaddfb3ab502c75e9bde5fcd9ce3b1' // created 10008355

export function getEthPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  let usdcPairVolatile = Pair.load(USDC_WETH_PAIR_VOLATILE) // usdc is token0

  // all 3 have been created
  if (usdcPairVolatile !== null) {
    return usdcPairVolatile.token1Price
  }
  return ZERO_BD;
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  '0x0000000000000000000000000000000000000000', // ETH
  '0x4200000000000000000000000000000000000006', // WETH
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  '0x703D57164CA270b0B330A87FD159CfEF1490c0a5',
  '0x78a087d713Be963Bf307b18F2Ff8122EF9A63ae9',
  '0x7d89E05c0B93B24B5Cb23A073E60D008FEd1aCF9',
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  '0x9EaF8C1E34F05a589EDa6BAfdF391Cf6Ad3CB239',
  '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4',
  '0xB6fe221Fe9EeF5aBa221c348bA20A1Bf5e73624c',
  '0xE3B53AF74a4BF62Ae5511055290838050bf764Df',
  '0xEB466342C4d449BC9f53A865D5Cb90586f405215',
  '0xFd4330b0312fdEEC6d4225075b82E00493FF2e3f',
  '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  '0x3421cc14F0e3822Cf3B73C3a4BEC2A1023b8d9Cf',
  '0x1C7a460413dD4e964f96D8dFC56E7223cE88CD85',
  '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
]

// minimum liquidity required to count towards tracked volume for pairs with small # of Lps
let MINIMUM_USD_THRESHOLD_NEW_PAIRS = BigDecimal.fromString('400000')

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_ETH = BigDecimal.fromString('2')

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
export function findEthPerToken(token: Token): BigDecimal {
  if (token.id == WETH_ADDRESS) {
    return ONE_BD
  }
  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    let pairAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]), false)
    if (pairAddress.toHexString() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHexString())
      if (pair!.token0 == token.id && pair!.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
        let token1 = Token.load(pair!.token1)
        return pair!.token1Price.times(token1!.derivedETH as BigDecimal) // return token1 per our token * Eth per token 1
      }
      if (pair!.token1 == token.id && pair!.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
        let token0 = Token.load(pair!.token0)
        return pair!.token0Price.times(token0!.derivedETH as BigDecimal) // return token0 per our token * ETH per token 0
      }
    }
  }
  return ZERO_BD // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  pair: Pair
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = (token0.derivedETH as BigDecimal).times(bundle!.ethPrice)
  let price1 = (token1.derivedETH as BigDecimal).times(bundle!.ethPrice)

  // dont count tracked volume on these pairs - usually rebass tokens
  if (UNTRACKED_PAIRS.includes(pair.id)) {
    return ZERO_BD
  }

  // if less than 5 LPs, require high minimum reserve amount amount or return 0
  if (pair.liquidityProviderCount.lt(BigInt.fromI32(5))) {
    let reserve0USD = pair.reserve0.times(price0)
    let reserve1USD = pair.reserve1.times(price1)
    if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
      if (reserve0USD.plus(reserve1USD).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
      if (reserve0USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
      if (reserve1USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
  }

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0
      .times(price0)
      .plus(tokenAmount1.times(price1))
      .div(BigDecimal.fromString('2'))
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0)
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1)
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = (token0.derivedETH as BigDecimal).times(bundle!.ethPrice)
  let price1 = (token1.derivedETH as BigDecimal).times(bundle!.ethPrice)

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1))
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}
