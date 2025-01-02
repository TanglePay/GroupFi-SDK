import { beforeEach, describe, expect, test, beforeAll } from '@jest/globals';
import { isUniversalProfileAddress } from '../src/address_check'

describe('address_check teset', () => {
  test('isUniversalProfileAddress', async () => {
    const rpc = 'https://42.rpc.thirdweb.com'
    const address1 = '0x8ffd1d75138fba044612549492aD25E9D9456F8E'

    const res1 = await isUniversalProfileAddress(address1)
    expect(res1).toBe(true)

    const address2 = '0x928100571464c900A2F53689353770455D78a200'

    const res2 = await isUniversalProfileAddress(address2)
    expect(res2).toBe(false)

    const address3 = '7KFJa5imvJfhjDtJjiBKda8bCjD2syc9Aa4RSCoMBzGe'
    const res3 = await isUniversalProfileAddress(address3)
    expect(res3).toBe(false)
  })
})