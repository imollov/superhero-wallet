<template>
  <Modal
    class="default"
    close
    @close="resolve"
  >
    <template
      v-if="title"
      slot="header"
    >
      {{ title }}
    </template>
    {{ msg || $t(`modals.${type}.msg`) }}
    <Button
      slot="footer"
      @click="resolve"
    >
      {{ $t('ok') }}
    </Button>
  </Modal>
</template>

<script>
import Modal from '../Modal';
import Button from '../Button';

export default {
  components: { Modal, Button },
  props: {
    resolve: { type: Function, required: true },
    title: { type: String, default: '' },
    msg: { type: String, default: '' },
    type: { type: String, default: '' },
  },
};
</script>
