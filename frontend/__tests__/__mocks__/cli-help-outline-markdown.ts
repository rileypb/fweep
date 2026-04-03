const markdown = `- Creating rooms
  - \`create kitchen\`
    - from:blank.png
    - to:kitchen.png
  - \`create pantry west of kitchen\`
    - from:kitchen.png
    - to:pantrykitchen.png
- Connecting rooms
  - \`connect pantry...\`
    \`...east to kitchen\`
      - from:blank.png
      - to:kitchen.png
    \`...east to kitchen south\`
      - from:blank.png
      - to:kitchen.png
`;

export default markdown;
