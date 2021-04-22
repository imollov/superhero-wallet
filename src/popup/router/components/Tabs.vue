<template>
  <div class="tabs">
    <slot />
  </div>
</template>

<style lang="scss" scoped>
@import '../../../styles/typography';

.tabs {
  display: flex;
  justify-content: space-around;
  width: 100%;
  height: 58px;

  a {
    display: flex;
    justify-content: center;
    align-items: center;
    text-decoration: none;
    width: 100%;
    cursor: pointer;

    @extend %face-sans-16-medium;

    color: $color-dark-grey;
    line-height: 24px;
    background-color: $color-bg-2;
    border: 1px solid $color-bg-3;
    border-radius: 0 0 2px 4px;

    &:hover {
      background-color: $color-border;
    }

    &.router-link-exact-active {
      color: $color-green;

      &,
      &:hover {
        background-color: $color-bg-3;
      }
    }

    ::v-deep svg {
      width: 20px;
      margin-right: 6px;
    }
  }
}
</style>
