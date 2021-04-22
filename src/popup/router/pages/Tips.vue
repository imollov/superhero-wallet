<template>
  <div class="tips">
    <AccountInfo />
    <BalanceInfo />
    <Tabs>
      <router-link :to="{ name: 'tips-send' }">
        <TipIcon /> Send tip
      </router-link>
      <router-link :to="{ name: 'tips-claim' }">
        <ClaimTipsIcon /> Claim tips
      </router-link>
    </Tabs>
    <RouterView />
  </div>
</template>

<script>
import AccountInfo from '../components/AccountInfo';
import BalanceInfo from '../components/BalanceInfo';
import Tabs from '../components/Tabs';
import TipIcon from '../../../icons/tip.svg?vue-component';
import ClaimTipsIcon from '../../../icons/tips.svg?vue-component';

export default {
  components: {
    AccountInfo,
    BalanceInfo,
    Tabs,
    TipIcon,
    ClaimTipsIcon,
  },
};
</script>
