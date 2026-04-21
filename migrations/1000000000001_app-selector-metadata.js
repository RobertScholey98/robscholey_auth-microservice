/* eslint-disable @typescript-eslint/no-var-requires */

exports.up = (pgm) => {
  pgm.addColumns('apps', {
    version: { type: 'text' },
    last_updated_at: { type: 'timestamptz' },
    status_variant: { type: 'text' },
    visual_key: { type: 'text' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('apps', ['version', 'last_updated_at', 'status_variant', 'visual_key']);
};
