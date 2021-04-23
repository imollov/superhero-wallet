import { TX_TYPE } from '@aeternity/aepp-sdk/es/tx/builder/schema';
import { popupProps, txParams } from '../../../src/popup/utils/config';
import locale from '../../../src/popup/locales/en.json';

const popups = ['connectConfirm', 'sign', 'messageSign'];
const txTypes = [TX_TYPE.spend, TX_TYPE.contractCall, TX_TYPE.contractCreate];

describe('Tests cases for AEX-2 popups', () => {
  beforeEach(() => {
    cy.login();
  });

  it('Sign Message popup, Conncet display correct data', () => {
    const props = popupProps.messageSign;
    const host = `${props.app.host} (${props.app.name})`;
    cy.openAex2Popup('messageSign')
      .get('[data-cy=host]')
      .should('be.visible')
      .should('contain', host)
      .get('[data-cy=message]')
      .should('be.visible')
      .should('contain', props.message);

    const props1 = popupProps.connectConfirm;
    const host1 = `${props.app.host} (${props1.app.name})`;
    cy.openAex2Popup('connectConfirm')
      .get('[data-cy=aepp]')
      .should('be.visible')
      .should('contain', host1)
      .get('[data-cy=host]')
      .should('be.visible')
      .should('contain', props1.app.host)
      .get('[data-cy=name]')
      .should('be.visible')
      .should('contain', props1.app.name);
  });

  it('Opens connectConfirm, sign, messageSign popups and send accept/deny action', () => {
    popups.forEach((popup) => {
      cy.openAex2Popup(popup, popup === 'sign' && TX_TYPE.spend)
        .get('[data-cy=deny]')
        .click()
        .window()
        .then((win) => {
          expect(win.reject).to.equal('send');
        });
    });

    popups.forEach((popup) => {
      cy.openAex2Popup(popup, popup === 'sign' && TX_TYPE.spend)
        .get('[data-cy=accept]')
        .click()
        .window()
        .then((win) => {
          expect(win.resolve).to.equal('send');
        });
    });
  });

  txTypes.forEach((txType) => {
    it(`Sign Popup display correct ${txType} data`, () => {
      const tx = txParams[txType];
      const amount = tx.amount / 10 ** 18;
      const fee = tx.fee / 10 ** 18;
      let receiver;
      if (txType === 'spendTx') {
        receiver = tx.recipientId;
      } else if (txType === 'contractCallTx') {
        receiver = tx.contractId;
      } else {
        receiver = 'Contract create';
      }
      cy.openAex2Popup('sign', txType)
        .get('[data-cy=title]')
        .should('be.visible')
        .should('contain', locale.transaction.type[txType]);

      cy.get('[data-cy=recipient]').should('be.visible').should('contain', receiver);

      cy.get('[data-cy=fee]')
        .should('be.visible')
        .should('contain', fee.toFixed(2))
        .get('[data-cy=total]')
        .should('be.visible')
        .should('contain', parseFloat(amount + fee).toFixed(2));
    });
  });
});
