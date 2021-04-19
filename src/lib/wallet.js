import { Node, RpcWallet } from '@aeternity/aepp-sdk/es';
import { BrowserWindowMessageConnection } from '@aeternity/aepp-sdk/es/utils/aepp-wallet-communication/connection/browser-window-message';
import Swagger from '@aeternity/aepp-sdk/es/utils/swagger';
import { camelCase, isEqual, times } from 'lodash-es';
import { fetchJson, IN_FRAME } from '../popup/utils/helper';
import store from '../store';
import { App } from '../store/modules/permissions';
import Logger from './logger';

async function initMiddleware() {
  const { middlewareUrl } = store.getters.activeNetwork;

  const swagUrl = `${middlewareUrl}/swagger/swagger.json`;

  const swag = await fetchJson(swagUrl);
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

let initSdkRunning = false;

if (IN_FRAME) {
  store.registerModule('sdk-frame-reset', {
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

export default async function initSdk() {
  if (initSdkRunning) return;
  initSdkRunning = true;

  store.commit('setNodeStatus', 'connecting');
  const { activeNetwork } = store.getters;
  const { url, compilerUrl } = activeNetwork;
  const node = await Node({ url });
  try {
    const acceptCb = (_, { accept }) => accept();
    const signCb = async (_, action, origin) => {
      const { method, params } = action;
      try {
        const originUrl = new URL(origin);
        const permission = await store.dispatch('permissions/checkPermissions', {
          host: originUrl.hostname,
          method,
          params: params?.txObject?.params,
        });
        if (method === 'message.sign') {
          if (!permission) {
            await store.dispatch('modals/open', {
              name: 'confirm-message-sign',
              message: params.message,
              app: {
                name: originUrl.host,
                host: originUrl.host,
                protocol: originUrl.protocol,
              },
            });
          }
          action.accept({ onAccount: { sign: () => {}, address: () => {} } });
          return;
        }
        action.accept(null, {
          onAccount: {
            sign: async () => store.dispatch('accounts/signTransaction', {
              txBase64: params.tx,
              opt: {
                modal: !permission,
              },
            }),
            address: () => {},
          },
        });
      } catch (error) {
        action.deny();
        if (error.message !== 'Rejected by user') throw error;
      }
      action.deny();
    };

    const sdk = await RpcWallet.compose({
      methods: {
        getApp(aeppUrl) {
          const hostPermissions = store.state.permissions[aeppUrl.hostname];
          if (!hostPermissions) store.commit('permissions/addHost', aeppUrl.hostname);
          return new App(aeppUrl);
        },
        async address(...args) {
          const { address } = store.getters.account;
          const app = args.pop();
          if (app instanceof App) {
            const { host, hostname, protocol } = app.host;
            if (
              !(await store.dispatch('permissions/requestAddressForHost', {
                host: hostname,
                address,
                connectionPopupCb: async () => store.dispatch('modals/open', {
                  name: 'confirm-connect',
                  app: {
                    name: hostname,
                    icons: [],
                    protocol,
                    host,
                  },
                }),
              }))
            ) return Promise.reject(new Error('Rejected by user'));
          }
          return address;
        },
        sign: (data) => store.dispatch('accounts/sign', data),
        signTransaction: (txBase64, opt) => (opt.onAccount
          ? opt.onAccount.sign()
          : store.dispatch('accounts/signTransaction', { txBase64, opt })),
      },
    })({
      nodes: [{ name: activeNetwork.name, instance: node }],
      nativeMode: true,
      compilerUrl,
      name: 'Superhero',
      onConnection: acceptCb,
      async onSubscription(_, { accept, deny }, origin) {
        const address = await this.address(this.getApp(new URL(origin)));
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
        () => getArrayOfAvailableFrames()
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
    setTimeout(() => store.commit('setNodeStatus', ''), 2000);

    store.watch(
      (state, getters) => getters.activeNetwork,
      async (network, oldNetwork) => {
        if (isEqual(network, oldNetwork)) return;
        try {
          store.commit('setNodeStatus', 'connecting');
          sdk.pool.delete(network.name);
          sdk.addNode(network.name, await Node({ url: network.url }), true);
          await initMiddleware();
          store.commit('setNodeStatus', 'connected');
          setTimeout(() => store.commit('setNodeStatus', ''), 2000);
        } catch (error) {
          store.commit('setNodeStatus', 'error');
          Logger.write(error);
        }
      },
    );
  } catch (e) {
    store.commit('setNodeStatus', 'error');
    Logger.write(e);
  } finally {
    initSdkRunning = false;
  }
}
