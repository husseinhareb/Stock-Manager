// constants/Colors.ts
export const Colors = {
  light: {
    text:        '#000000',
    background:  '#FFFFFF',
    tint:        '#6200EE',
    icon:        '#333333',
    tabIconDefault:  '#C0C0C0',
    tabIconSelected: '#6200EE',

    // Newly added keys for your styled screen:
    primary:     '#6200EE', // accent/main action color
    accent:      '#03DAC6', // secondary action color
    border:      '#DDDDDD', // input and card borders
    placeholder: '#AAAAAA', // TextInput placeholder
    card:        '#FFFFFF', // background for list items
    footer:      '#F8F8F8', // background for sticky footer
    badgeText:   '#FFFFFF', // text color inside quantity badge
    shadow:      '#000000', // shadow color on cards/fabs
  },
  dark: {
    text:        '#FFFFFF',
    background:  '#000000',
    tint:        '#BB86FC',
    icon:        '#FFFFFF',
    tabIconDefault:  '#888888',
    tabIconSelected: '#BB86FC',

    // Dark‐mode counterparts:
    primary:     '#BB86FC',
    accent:      '#03DAC6',
    border:      '#333333',
    placeholder: '#666666',
    card:        '#121212',
    footer:      '#181818',
    badgeText:   '#000000',
    shadow:      '#000000',
  },
} as const;
