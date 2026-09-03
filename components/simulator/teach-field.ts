'use client';

import * as Blockly from 'blockly';
import { TEACH_EXTENSION, TEACH_LABEL } from '@prompower/blocks';

/**
 * Кнопка «показать роботу» внутри блока движения.
 *
 * Blockly не знает ни про сцену, ни про React, поэтому нажатие уезжает наружу
 * обычным событием DOM на холсте редактора. Связь односторонняя: редактор
 * сообщает «этот блок просят показать», а что делать дальше — дело экрана урока.
 */

export const TEACH_EVENT = 'pp-teach';

export interface TeachEventDetail {
  readonly blockId: string;
}

/** Класс на поле нужен тесту: искать по русскому тексту внутри SVG хрупко. */
const FIELD_CLASS = 'ppTeachField';

class TeachField extends Blockly.Field<string> {
  override EDITABLE = true;
  override SERIALIZABLE = false;

  constructor() {
    super(TEACH_LABEL);
  }

  protected override initView(): void {
    super.initView();
    const root = this.getSvgRoot();
    if (root !== null) Blockly.utils.dom.addClass(root, FIELD_CLASS);
  }

  protected override showEditor_(): void {
    const block = this.getSourceBlock();
    if (block === null) return;

    const workspace = block.workspace;
    if (!(workspace instanceof Blockly.WorkspaceSvg)) return;

    workspace.getInjectionDiv().dispatchEvent(
      new CustomEvent<TeachEventDetail>(TEACH_EVENT, {
        detail: { blockId: block.id },
        bubbles: true,
      }),
    );
  }
}

let registered = false;

/** Расширение регистрируется до определения блоков: иначе Blockly их отвергнет. */
export function registerTeachExtension(): void {
  if (registered) return;
  Blockly.Extensions.register(TEACH_EXTENSION, function (this: Blockly.Block) {
    this.appendDummyInput('TEACH').appendField(new TeachField());
  });
  registered = true;
}
