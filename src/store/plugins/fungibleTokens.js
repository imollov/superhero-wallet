import Vue from 'vue';
import FUNGIBLE_TOKEN_CONTRACT from 'aeternity-fungible-token/FungibleTokenFullInterface.aes';
import BigNumber from 'bignumber.js';
import { unionBy, isEqual } from 'lodash-es';
import { convertToken, fetchJson, handleUnknownError } from '../../popup/utils/helper';

export default (store) => {
  store.registerModule('fungibleTokens', {
    namespaced: true,
    state: {
      availableTokens: {},
      tokens: {},
      aePublicData: {},
    },
    getters: {
      getTokenBalance: ({ tokens }) => (address) => tokens[address]?.tokenBalances || [],
      getSelectedToken: ({ tokens }) => (address) => tokens[address]?.selectedToken,
      tokenBalances: (
        state, { getTokenBalance }, rootState, { account: { address } },
      ) => getTokenBalance(address),
      selectedToken: (
        state, { getSelectedToken }, rootState, { account: { address } },
      ) => getSelectedToken(address),
    },
    mutations: {
      setSelectedToken(state, { address, token }) {
        if (!(address in state.tokens)) {
          Vue.set(state.tokens, address, { selectedToken: null, tokenBalances: [] });
        }
        Vue.set(state.tokens[address], 'selectedToken', token);
      },
      setAvailableTokens(state, payload) {
        state.availableTokens = payload;
      },
      resetTokens(state) {
        state.tokens = {};
      },
      addTokenBalance(state, { address, token }) {
        if (!(address in state.tokens)) {
          Vue.set(state.tokens, address, { selectedToken: null, tokenBalances: [] });
        }
        Vue.set(
          state.tokens[address],
          'tokenBalances',
          unionBy([token], state.tokens[address].tokenBalances, 'contract'),
        );
      },
      setAePublicData(state, payload) {
        state.aePublicData = payload;
      },
    },
    actions: {
      async getAvailableTokens({ rootGetters: { activeNetwork }, commit }) {
        const availableTokens = await fetchJson(
          `${activeNetwork.backendUrl}/tokenCache/tokenInfo`,
        ).catch(handleUnknownError);
        return commit('setAvailableTokens', availableTokens || {});
      },
      async tokenBalance({ rootState: { sdk } }, [token, address]) {
        const tokenContract = await sdk.getContractInstance(FUNGIBLE_TOKEN_CONTRACT, {
          contractAddress: token,
        });

        const { decodedResult } = await tokenContract.methods.balance(address);
        return new BigNumber(decodedResult || 0);
      },
      async loadTokenBalances({
        rootGetters: { activeNetwork, accounts },
        state: { availableTokens },
        commit,
        dispatch,
      }) {
        accounts.map(async ({ address }) => {
          const tokens = await fetchJson(
            `${activeNetwork.backendUrl}/tokenCache/balances?address=${address}`,
          ).catch(handleUnknownError);

          const selectedToken = store.state.fungibleTokens.tokens[address]?.selectedToken;

          await Promise.all(
            Object.entries(tokens).map(async ([contract, tokenData]) => {
              const tokenBalance = await dispatch('tokenBalance', [contract, address]);
              const balance = convertToken(tokenBalance, -tokenData.decimals);
              const convertedBalance = balance.toFixed(2);
              const objectStructure = {
                value: contract,
                text: `${convertedBalance} ${tokenData.symbol}`,
                symbol: tokenData.symbol,
                name: tokenData.name,
                decimals: tokenData.decimals,
                contract,
                balance,
                convertedBalance,
              };
              if (availableTokens[contract]) {
                const updatedTokenInfo = { ...availableTokens };
                updatedTokenInfo[contract] = { ...objectStructure };
                commit('setAvailableTokens', updatedTokenInfo);
              }
              if (selectedToken && selectedToken.contract === objectStructure.contract) {
                commit('setSelectedToken', { address, token: objectStructure });
              }
              return commit('addTokenBalance', { address, token: objectStructure });
            }),
          );

          if (selectedToken && !tokens[selectedToken.contract]) {
            commit('setSelectedToken', { address, token: null });
          }
        });
      },
      async getAeternityData({ rootState: { current }, commit }) {
        const [aeternityData] = await fetchJson(
          `https://api.coingecko.com/api/v3/coins/markets?ids=aeternity&vs_currency=${current.currency}`,
        );
        return commit('setAePublicData', aeternityData);
      },
      async createOrChangeAllowance(
        { rootState: { sdk }, state: { tokens }, rootGetters: { activeNetwork, account } },
        amount,
      ) {
        const { selectedToken } = tokens[account.address];
        const tokenContract = await sdk.getContractInstance(FUNGIBLE_TOKEN_CONTRACT, {
          contractAddress: selectedToken.contract,
        });
        const { decodedResult } = await tokenContract.methods.allowance({
          from_account: account.address,
          for_account: activeNetwork.tipContractV2.replace('ct_', 'ak_'),
        });
        const allowanceAmount = decodedResult !== undefined
          ? new BigNumber(decodedResult)
            .multipliedBy(-1)
            .plus(convertToken(amount, selectedToken.decimals))
            .toNumber()
          : convertToken(amount, selectedToken.decimals).toFixed();
        return tokenContract.methods[
          decodedResult !== undefined ? 'change_allowance' : 'create_allowance'
        ](activeNetwork.tipContractV2.replace('ct_', 'ak_'), allowanceAmount);
      },
      async transfer(
        { rootState: { sdk }, state: { tokens }, rootGetters: { account } },
        [toAccount, amount, option],
      ) {
        const tokenContract = await sdk.getContractInstance(FUNGIBLE_TOKEN_CONTRACT, {
          contractAddress: tokens[account.address].selectedToken.contract,
        });
        return tokenContract.methods.transfer(
          toAccount,
          convertToken(amount, tokens[account.address].selectedToken.decimals).toFixed(),
          option,
        );
      },
    },
  });

  store.watch(
    ({ middleware }) => middleware,
    async (middleware) => {
      if (!middleware) return;

      await store.dispatch('fungibleTokens/getAvailableTokens');
      await store.dispatch('fungibleTokens/loadTokenBalances');
    },
    { immediate: true },
  );

  store.watch(
    (state, { activeNetwork }) => activeNetwork,
    async (network, oldNetwork) => {
      if (isEqual(network, oldNetwork)) return;
      store.commit('fungibleTokens/resetTokens');
    },
  );

  store.watch(
    ({ accountCount }) => accountCount,
    async () => {
      if (!store.state.middleware) return;
      await store.dispatch('fungibleTokens/loadTokenBalances');
    },
    { immediate: true },
  );
};
