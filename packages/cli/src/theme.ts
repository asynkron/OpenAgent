import type { BoxStyleProps, TextStyleProps, TextStyleMap } from './styleTypes.js';

const theme = {
  human: {
    colors: {
      fg: '#f5f5f5',
      bg: '#192834',
    },
    props: {
      container: {
        flexDirection: 'column',
        marginTop: 0,
        paddingX: 1,
        paddingY: 1,
        backgroundColor: '#192834',
        width: '100%',
        alignSelf: 'stretch',
        flexGrow: 1,
      } satisfies BoxStyleProps,
      text: {
        color: '#f5f5f5',
      } satisfies TextStyleProps,
      askHuman: {
        container: {
          flexDirection: 'column',
          marginTop: 0,
          paddingX: 1,
          paddingY: 0,
          backgroundColor: '#192834',
        } satisfies BoxStyleProps,
        inputRow: {
          flexDirection: 'row',
          paddingX: 1,
          paddingY: 1,
        } satisfies BoxStyleProps,
        footer: {
          flexDirection: 'column',
          paddingX: 1,
          paddingBottom: 1,
        } satisfies BoxStyleProps,
        footerHint: {
          dimColor: true,
          color: '#f5f5f5',
        } satisfies TextStyleProps,
        spinnerText: {
          color: '#f5f5f5',
          marginLeft: 1,
        } satisfies TextStyleProps,
        textArea: {
          marginLeft: 1,
        } satisfies BoxStyleProps,
      },
    },
  },
  agent: {
    colors: {
      fg: '#f5f5f5',
      bg: '',
    },
    props: {
      container: {
        flexDirection: 'column',
        marginTop: 0,
        paddingX: 1,
        paddingY: 1,
        backgroundColor: '',
        width: '100%',
        alignSelf: 'stretch',
        flexGrow: 1,
      } satisfies BoxStyleProps,
      text: {
        color: '#f5f5f5',
      } satisfies TextStyleProps,
    },
  },
  plan: {
    colors: {
      fg: '#f5f5f5',
      bg: '#14202aff',
      heading: '#7dd3fc',
    },
    props: {
      container: {
        flexDirection: 'column',
        marginTop: 1,
        paddingX: 1,
        paddingY: 1,
        backgroundColor: '#14202a',
        width: '100%',
        alignSelf: 'stretch',
        flexGrow: 1,
      } satisfies BoxStyleProps,
      heading: {
        color: '#7dd3fc',
        bold: true,
      } satisfies TextStyleProps,
    },
  },
  command: {
    colors: {
      fg: '#f5f5f5',
      bg: '',
      headerBg: '',
    },
    props: {
      container: {
        borderStyle: 'round',
        borderColor: '#ffffff',
        flexDirection: 'column',
        marginTop: 1,
        paddingX: 1,
        paddingY: 1,
        backgroundColor: '',
        width: '100%',
        alignSelf: 'stretch',
        flexGrow: 1,
      } satisfies BoxStyleProps,
      heading: {
        color: '#f5f5f5',
      } satisfies TextStyleProps,
      headingBadge: {
        backgroundColor: '',
        color: '#f5f5f5',
        bold: true,
      } satisfies TextStyleProps,
      summaryLine: {
        base: {
          color: '#f5f5f5',
        } satisfies TextStyleProps,
        arrow: {
          dimColor: true,
        } satisfies TextStyleProps,
        indent: {
          dimColor: true,
        } satisfies TextStyleProps,
        default: {
          dimColor: true,
        } satisfies TextStyleProps,
        error: {
          color: 'red',
        } satisfies TextStyleProps,
        success: {
          color: 'green',
        } satisfies TextStyleProps,
      } satisfies TextStyleMap,
      runContainer: {
        flexDirection: 'column',
        marginTop: 1,
      } satisfies BoxStyleProps,
    },
  },
  prompt: {
    colors: {
      fg: '#ffffff',
      bg: '#370c21',
    },
    props: {
      container: {
        flexDirection: 'column',
        marginTop: 0,
        paddingX: 1,
        paddingY: 1,
        backgroundColor: '#370c21',
        width: '100%',
        alignSelf: 'stretch',
        flexGrow: 1,
      } satisfies BoxStyleProps,
      text: {
        color: '#ffffff',
      } satisfies TextStyleProps,
    },
  },
} as const;

export type Theme = typeof theme;

export default theme;
