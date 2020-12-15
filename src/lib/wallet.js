import { Node, MemoryAccount, RpcWallet } from '@aeternity/aepp-sdk/es';
import Swagger from '@aeternity/aepp-sdk/es/utils/swagger';
import { BrowserWindowMessageConnection } from '@aeternity/aepp-sdk/es/utils/aepp-wallet-communication/connection/browser-window-message';
import { isEmpty, times, camelCase } from 'lodash-es';
import store from '../store';
import { postMessage } from '../popup/utils/connection';
import { parseFromStorage, fetchJson, IN_FRAME, getAeppUrl } from '../popup/utils/helper';
import Logger from './logger';
import { App } from '../store/modules/permissions';

async function initMiddleware() {
  const { middlewareUrl } = store.getters.activeNetwork;
  const swag = await fetchJson(`${middlewareUrl}/swagger/swagger.json`);
  swag.paths = {
    ...swag.paths,
    'name/auction/{name}': {
      get: {
        operationId: 'getAuctionInfoByName',
        parameters: [
          {
            in: 'path',
            name: 'name',
            required: true,
            type: 'string',
          },
        ],
      },
    },
    'txs/backward': {
      get: {
        operationId: 'getTxByAccount',
        parameters: [
          {
            in: 'query',
            name: 'account',
            required: true,
            type: 'string',
          },
          {
            in: 'query',
            name: 'limit',
            required: true,
            type: 'integer',
          },
          {
            in: 'query',
            name: 'page',
            required: true,
            type: 'integer',
          },
        ],
      },
    },
  };
  const { api: middleware } = await Swagger.compose({
    methods: {
      urlFor: (path) => middlewareUrl + path,
      axiosError: () => '',
    },
  })({ swag });

  store.commit(
    'setMiddleware',
    Object.entries(middleware).reduce((m, [k, v]) => ({ ...m, [camelCase(k)]: v }), {}),
  );
}

async function logout() {
  store.commit('setActiveAccount', { publicKey: '', index: 0 });
  store.commit('updateAccount', {});
  store.commit('switchLoggedIn', false);
}

async function getKeyPair() {
  const { activeAccount } = store.state;
  const { account } = store.getters;
  const res = await postMessage({ type: 'getKeypair', payload: { activeAccount, account } });
  return res.error ? { error: true } : parseFromStorage(res);
}

let initSdkRunning = false;

if (IN_FRAME) {
  store.registerModule('sdk', {
    actions: {
      async reset({ sdk }) {
        const { clients } = sdk.getClients();
        Array.from(clients.values()).forEach((aepp) => {
          aepp.sendMessage(
            { method: 'connection.close', params: { reason: 'bye' }, jsonrpc: '2.0' },
            true,
          );
          aepp.disconnect();
        });
      },
    },
  });
}

export default {
  async init() {
    const { account } = store.getters;
    if (isEmpty(account)) {
      store.commit('setMainLoading', false);
      return { loggedIn: false };
    }
    const address = await store.dispatch('generateWallet', { seed: account.privateKey });
    store.commit('updateAccount', account);
    store.commit('setActiveAccount', { publicKey: address, index: 0 });

    store.commit('switchLoggedIn', true);

    store.commit('setMainLoading', false);
    return { loggedIn: true };
  },
  async initSdk() {
    if (initSdkRunning) return;
    initSdkRunning = true;
    const keypair = await getKeyPair();
    if (keypair.error) {
      await logout();
      return;
    }

    const { activeNetwork } = store.getters;
    const { url, compilerUrl } = activeNetwork;
    const node = await Node({ url });
    const account = MemoryAccount({ keypair });
    try {
      const acceptCb = (_, { accept }) => accept();
      const signCb = async (aepp, action, origin) => {
        const { method, params } = action;
        try {
          if (
            await store.dispatch('permissions/checkPermissions', {
              host: getAeppUrl(aepp).hostname,
              method,
              params: params?.txObject?.params,
            })
          ) {
            await store.dispatch('modals/open', {
              name: 'confirm-message-sign',
              message: action.params.message,
              origin,
            });
            action.accept.apply(null, [
              ...(method === 'message.sign' ? [] : [null]),
              { onAccount: { sign: () => {}, address: () => {} } },
            ]);
          }
        } catch (error) {
          action.deny();
          if (error.message !== 'Rejected by user') throw error;
        }
      };

      const sdk = await RpcWallet.compose({
        methods: {
          getApp(aeppUrl) {
            const hostPermissions = store.state.permissions[aeppUrl.hostname];
            if (!hostPermissions) store.commit('permissions/addHost', aeppUrl.hostname);
            return new App(aeppUrl);
          },
          async address(...args) {
            const address = store.state.account.publicKey;
            const app = args[args.length - 1];
            if (app instanceof App) {
              const { host, hostname, protocol } = app.host;
              if (
                !(await store.dispatch('permissions/requestAddressForHost', {
                  host: hostname,
                  address,
                  connectionPopupCb: async () =>
                    store.dispatch('modals/open', {
                      name: 'confirm-connect',
                      app: {
                        name: hostname,
                        icons: [],
                        protocol,
                        host,
                      },
                    }),
                }))
              )
                return Promise.reject(new Error('Rejected by user'));
            }
            return address;
          },
          sign: (data) => store.dispatch('accounts/sign', data),
          signTransaction: (txBase64, opt) =>
            store.dispatch('accounts/signTransaction', { txBase64, opt }),
        },
      })({
        nodes: [{ name: activeNetwork.name, instance: node }],
        accounts: [account],
        nativeMode: true,
        compilerUrl,
        name: 'Superhero',
        onConnection: acceptCb,
        async onSubscription(aepp, { accept, deny }) {
          const address = await this.address(this.getApp(getAeppUrl(aepp)));
          if (!address) {
            deny();
            return;
          }
          accept({
            accounts: {
              current: { [address]: {} },
              connected: {},
            },
          });
        },
        onSign: signCb,
        onMessageSign: signCb,
        onAskAccounts: acceptCb,
        onDisconnect(msg, client) {
          client.disconnect();
        },
      });

      if (IN_FRAME) {
        const getArrayOfAvailableFrames = () => [
          window.parent,
          ...times(window.parent.frames.length, (i) => window.parent.frames[i]),
        ];
        const executeAndSetInterval = (handler, timeout) => {
          handler();
          return setInterval(handler, timeout);
        };

        const connectedFrames = new Set();
        executeAndSetInterval(
          () =>
            getArrayOfAvailableFrames()
              .filter((frame) => frame !== window)
              .forEach((target) => {
                if (connectedFrames.has(target)) return;
                connectedFrames.add(target);
                const connection = BrowserWindowMessageConnection({ target });
                const originalConnect = connection.connect;
                let intervalId;
                connection.connect = function connect(onMessage) {
                  originalConnect.call(this, (data, origin, source) => {
                    if (source !== target) return;
                    clearInterval(intervalId);
                    onMessage(data, origin, source);
                  });
                };
                sdk.addRpcClient(connection);
                intervalId = executeAndSetInterval(() => {
                  if (!getArrayOfAvailableFrames().includes(target)) {
                    clearInterval(intervalId);
                    return;
                  }
                  sdk.shareWalletInfo(connection.sendMessage.bind(connection));
                }, 3000);
              }),
          3000,
        );
      }

      await store.commit('initSdk', sdk);
      await store.dispatch('initContractInstances');
      await initMiddleware();
      store.commit('setNodeStatus', 'connected');
      await store.dispatch('fungibleTokens/getAvailableTokens');
      store.dispatch('fungibleTokens/loadTokenBalances', keypair.publicKey);
      setTimeout(() => store.commit('setNodeStatus', ''), 2000);
    } catch (e) {
      store.commit('setNodeStatus', 'error');
      Logger.write(e);
    } finally {
      initSdkRunning = false;
    }
  },
};
