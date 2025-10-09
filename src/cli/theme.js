/**
 * Central theme definition for the CLI timeline. Exposes both color palette and
 * component-level Ink props so styling lives in one place.
 */
export const theme = Object.freeze({
  human: {
    colors: {
      fg: '#f5f5f5',
      bg: '#3a3a3dff',
    },
    props: {
      container: {
        flexDirection: 'column',
        marginTop: 1,
        paddingX: 1,
        paddingY: 1,
        backgroundColor: '#3a3a3dff',
        width: '100%',
        alignSelf: 'stretch',
        flexGrow: 1,
      },
      text: {
        color: '#f5f5f5',
      },
      askHuman: {
        container: {
          flexDirection: 'column',
          marginTop: 1,
          paddingX: 1,
          paddingY: 0,
          backgroundColor: '#3a3a3dff',
        },
        inputRow: {
          flexDirection: 'row',
          paddingX: 1,
          paddingY: 1,
        },
        footer: {
          flexDirection: 'column',
          paddingX: 1,
          paddingBottom: 1,
        },
        footerHint: {
          dimColor: true,
          color: '#f5f5f5',
        },
        spinnerText: {
          color: '#f5f5f5',
          marginLeft: 1,
        },
        textArea: {
          marginLeft: 1,
        },
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
        marginTop: 1,
        paddingX: 1,
        paddingY: 1,
        backgroundColor: '',
        width: '100%',
        alignSelf: 'stretch',
        flexGrow: 1,
      },
      text: {
        color: '#f5f5f5',
      },
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
        flexDirection: 'column',
        marginTop: 1,
        paddingX: 1,
        paddingY: 1,
        backgroundColor: '',
        width: '100%',
        alignSelf: 'stretch',
        flexGrow: 1,
      },
      heading: {
        color: '#f5f5f5',
      },
      headingBadge: {
        backgroundColor: '',
        color: '#f5f5f5',
        bold: true,
      },
      summaryLine: {
        base: {
          color: '#f5f5f5',
        },
        arrow: {
          dimColor: true,
        },
        indent: {
          dimColor: true,
        },
        default: {
          dimColor: true,
        },
        error: {
          color: 'red',
        },
        success: {
          color: 'green',
        },
      },
      runContainer: {
        flexDirection: 'column',
        marginTop: 1,
      },
    },
  },
  prompt: {
    colors: {
      fg: '#ffffff',
      bg: '#370c21ff',
    },
    props: {
      container: {
        flexDirection: 'column',
        marginTop: 1,
        paddingX: 1,
        paddingY: 1,
        backgroundColor: '#370c21ff',
        width: '100%',
        alignSelf: 'stretch',
        flexGrow: 1,
      },
      text: {
        color: '#ffffff',
      },
    },
  },
});

export default theme;
