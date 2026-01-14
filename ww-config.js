export default {
  editor: {
    label: {
      en: "My Element",
    },
  },
  actions: [
    { label: "Toggle recording", action: "toggleRecording" },
    { label: "Initialize camera", action: "initCamera" },
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
