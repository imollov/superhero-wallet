<template>
  <div
    v-if="showNavigation && !aeppPopup"
    class="header"
  >
    <div
      v-if="isLoggedIn || (title && !tourRunning)"
      class="left"
    >
      <RouterLink
        v-if="isLoggedIn"
        to="/account"
        class="home-button"
      >
        <Logo />
      </RouterLink>
      <button
        v-if="title && !tourRunning"
        class="icon-btn back"
        @click="back"
      >
        <Back data-cy="back-arrow" />
      </button>
    </div>

    <div
      :class="{ 'not-logged-in': !isLoggedIn }"
      class="title"
    >
      <TruncateMid
        v-if="pageTitle"
        :str="pageTitle"
        class="text"
      />
      <span
        v-else
        class="text"
      >
        {{ (title && $t(`pages.titles.${title}`)) || $t('pages.titles.home') }}
      </span>
    </div>

    <div
      v-if="isLoggedIn"
      class="right"
    >
      <button
        v-if="!$route.path.startsWith('/notifications')"
        class="notifications icon-btn"
        data-cy="noti"
        @click="toNotifications"
      >
        <Bell />
        <span
          v-if="notificationsCount"
          class="badge"
          data-cy="noti-count"
        >
          {{ notificationsCount }}
        </span>
      </button>

      <RouterLink
        v-if="$route.path === '/notifications'"
        to="/notifications/settings"
        class="icon-btn settings"
      >
        <Settings />
      </RouterLink>

      <button
        class="icon-btn menu"
        data-cy="hamburger"
        @click="$emit('toggle-sidebar')"
      >
        <Menu />
        <MenuHover class="hover" />
      </button>
    </div>
  </div>
</template>

<script>
import { mapState, mapGetters, mapMutations } from 'vuex';
import Logo from '../../../icons/logo-small.svg?vue-component';
import Back from '../../../icons/back.svg?vue-component';
import Bell from '../../../icons/bell.svg?vue-component';
import Settings from '../../../icons/notif-settings.svg?vue-component';
import Menu from '../../../icons/menu.svg?vue-component';
import MenuHover from '../../../icons/menu-hover.svg?vue-component';
import TruncateMid from './TruncateMid';

export default {
  components: {
    Logo, Back, Bell, Settings, Menu, MenuHover, TruncateMid,
  },
  data: () => ({
    aeppPopup: window.RUNNING_IN_POPUP,
  }),
  subscriptions() {
    return {
      superheroNotifications: this.$store.state.observables.notifications,
    };
  },
  computed: {
    ...mapGetters(['isLoggedIn']),
    ...mapState(['tourRunning', 'notifications', 'pageTitle']),
    title() {
      return this.$route.meta.title;
    },
    showNavigation() {
      return this.$route.meta.navigation !== undefined ? this.$route.meta.navigation : true;
    },
    notificationsCount() {
      return [...this.notifications, ...this.superheroNotifications].filter(
        (n) => n.status === 'CREATED',
      ).length;
    },
  },
  methods: {
    ...mapMutations(['setNotificationsStatus']),
    back() {
      const fallBackRoute = this.isLoggedIn ? '/account' : '/';
      let { fullPath } = this.$route;
      fullPath = fullPath.endsWith('/') ? fullPath.slice(0, -1) : fullPath;
      this.$router.push(
        fullPath.substr(0, fullPath.lastIndexOf('/')) || fallBackRoute,
      );
    },
    async toNotifications() {
      this.notifications.forEach((n) => this.setNotificationsStatus({ createdAt: n.createdAt, status: 'PEEKED' }));
      await this.$store.dispatch('modifyNotifications', [
        this.superheroNotifications.filter((n) => n.status === 'CREATED').map((n) => n.id),
        'PEEKED',
      ]);
      if (this.$store.state.route.fullPath !== '/notifications') {
        this.$router.push('/notifications');
      }
    },
  },
};
</script>

<style lang="scss" scoped>
@use '../../../styles/variables';
@use '../../../styles/typography';
@use '../../../styles/mixins';

.header {
  position: fixed;
  width: 360px;

  @include mixins.desktop {
    position: sticky;
  }

  top: 0;
  z-index: 8;
  height: calc(48px + env(safe-area-inset-top));
  background-color: variables.$color-bg-3;
  display: flex;
  padding: 8px 16px 8px 8px;
  padding-top: calc(8px + env(safe-area-inset-top));
  align-items: center;

  @include mixins.mobile {
    display: flex;
    justify-content: space-between;
    width: 100%;
  }

  .left {
    display: flex;
    flex-basis: 88px;
  }

  .right {
    display: flex;
    flex-basis: 82px;
    justify-content: flex-end;
  }

  .title {
    min-width: 166px;

    &.not-logged-in:not(:only-child) {
      width: 100%;
      position: absolute;
      z-index: -1;
    }

    .text {
      padding: 0 4px;
      display: flex;
      justify-content: center;
      white-space: nowrap;

      @extend %face-sans-16-medium;

      line-height: 24px;
      color: variables.$color-white;
    }
  }

  .left .home-button {
    padding: 4px 0;
    height: 32px;

    &:not(:disabled) {
      svg {
        cursor: pointer;
      }

      &:hover svg {
        color: variables.$color-blue-hover;
      }

      &:active svg {
        color: variables.$color-blue-hover;
        opacity: 0.9;
      }
    }

    svg {
      width: 34px;
      height: 24px;
      color: variables.$color-blue;
    }
  }

  .home-button + .back {
    margin-left: 22px;
  }

  .title:only-child {
    flex-grow: 2;
    margin-left: 8px;
  }

  .settings,
  .notifications {
    margin-right: 8px;
  }

  .icon-btn {
    cursor: pointer;
    width: 32px;
    height: 32px;
    padding: 0;
    display: flex;
    justify-content: center;
    align-items: center;

    svg {
      width: 24px;
      height: 24px;
      color: variables.$color-white;
      opacity: 0.7;

      &.hover {
        display: none;
      }
    }

    &:hover {
      border-radius: 50%;
      background-color: variables.$color-hover;

      svg {
        opacity: 1;
      }

      &:not(:active).menu svg {
        display: none;

        &.hover {
          display: inline;
        }
      }
    }
  }

  .notifications {
    position: relative;

    .badge {
      color: variables.$color-white;
      position: absolute;
      left: -2px;
      top: 20%;
      width: 14px;
      height: 14px;
      background: variables.$color-blue;
      border-radius: 50%;
      text-align: center;
      font-size: 12px;
      line-height: 14px;
    }
  }
}
</style>
