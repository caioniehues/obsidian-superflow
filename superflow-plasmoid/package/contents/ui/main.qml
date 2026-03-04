import QtQuick
import QtQuick.Layouts
import Qt.labs.platform as Platform
import org.kde.plasma.plasmoid
import org.kde.plasma.components as PlasmaComponents
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root

    // Show text directly in panel (not popup)
    preferredRepresentation: fullRepresentation

    // Tooltip on hover
    Plasmoid.toolTipMainText: taskTitle || "SuperFlow"
    Plasmoid.toolTipSubText: isRunning ? "Progress: " + Math.floor(progress * 100) + "%" : "Paused"

    property string taskTitle: ""
    property int timeRemaining: 0
    property bool isRunning: false
    property real progress: 0
    property string statePath: Platform.StandardPaths.writableLocation(Platform.StandardPaths.ConfigLocation) + "/superflow/state.json"

    // Poll state.json every second
    Timer {
        interval: 1000
        running: true
        repeat: true
        onTriggered: loadState()
    }

    // Display: "Task Name — MM:SS" or "SuperFlow"
    fullRepresentation: MouseArea {
        implicitWidth: label.implicitWidth
        implicitHeight: label.implicitHeight

        // Click to focus Obsidian via its URI protocol
        onClicked: Qt.openUrlExternally("obsidian://")

        PlasmaComponents.Label {
            id: label
            text: root.taskTitle
                  ? root.taskTitle + " — " + formatTime(root.timeRemaining) + (root.isRunning ? "" : " ⏸")
                  : "SuperFlow"
            color: root.isRunning ? Kirigami.Theme.positiveTextColor
                 : root.taskTitle ? Kirigami.Theme.disabledTextColor
                 : Kirigami.Theme.textColor
        }
    }

    function formatTime(seconds) {
        var mins = Math.floor(seconds / 60)
        var secs = seconds % 60
        return mins + ":" + (secs < 10 ? "0" : "") + secs
    }

    function loadState() {
        var xhr = new XMLHttpRequest()
        xhr.open("GET", "file://" + statePath)
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                try {
                    var data = JSON.parse(xhr.responseText)
                    root.taskTitle = data.currentTask ? data.currentTask.title : ""
                    root.timeRemaining = data.timer ? data.timer.timeRemaining : 0
                    root.isRunning = data.timer ? data.timer.isRunning : false
                    root.progress = data.timer ? data.timer.progress : 0
                } catch(e) {
                    // File not ready yet
                }
            }
        }
        xhr.send()
    }

    Component.onCompleted: loadState()
}
