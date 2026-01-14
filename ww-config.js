export default {
  editor: {
    label: {
      en: "My Element",
    },
  },
  actions: [
    {
      id: "toggleRecording",
      name: "toggleRecording",
      value: "toggleRecording",
      label: {
        en: "Toggle recording",
        fr: "Demarrer/arreter l'enregistrement",
      },
    },
    {
      id: "initCamera",
      name: "initCamera",
      value: "initCamera",
      label: {
        en: "Initialize camera",
        fr: "Initialiser la camera",
      },
    },
  ],
  properties: {
    textColor: {
      label: {
        en: "Text color",
      },
      type: "Color",
      defaultValue: "#F23636",
    },
  },
};
