<template>
  <div class="payments">
    <AccountInfo />
    <BalanceInfo />
    <Tabs>
      <router-link :to="{ name: 'payments-send' }">
        <SendIcon /> Send
      </router-link>
      <router-link :to="{ name: 'payments-receive' }">
        <ReceiveIcon /> Receive
      </router-link>
    </Tabs>
    <RouterView />
  </div>
</template>

<script>
import AccountInfo from '../components/AccountInfo';
import BalanceInfo from '../components/BalanceInfo';
import Tabs from '../components/Tabs';
import SendIcon from '../../../icons/send.svg?vue-component';
import ReceiveIcon from '../../../icons/receive.svg?vue-component';

export default {
  components: {
    AccountInfo,
    BalanceInfo,
    Tabs,
    SendIcon,
    ReceiveIcon,
  },
};
</script>
