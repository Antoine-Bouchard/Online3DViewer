import { BigEps, IsEqualEps, RadDeg } from '../engine/geometry/geometry.js';
import { AddDiv, ClearDomElement } from '../engine/viewer/domutils.js';
import { AddSvgIconElement, IsDarkTextNeededForColor } from './utils.js';

import * as THREE from 'three';
import { ColorComponentToFloat, RGBColor } from '../engine/model/color.js';

function GetFaceWorldNormal(intersection) {
    let normalMatrix = new THREE.Matrix4();
    intersection.object.updateWorldMatrix(true, false);
    normalMatrix.extractRotation(intersection.object.matrixWorld);
    let faceNormal = intersection.face.normal.clone();
    faceNormal.applyMatrix4(normalMatrix);
    return faceNormal;
}

function CreateMaterial() {
    return new THREE.LineBasicMaterial({
        color: 0x263238,
        depthTest: false
    });
}

function CreateLineFromPoints(points, material) {
    let geometry = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.Line(geometry, material);
}

class Marker {
    constructor(intersection, radius) {
        this.intersection = null;
        this.markerObject = new THREE.Object3D();
        let material = CreateMaterial();
        let circleCurve = new THREE.EllipseCurve(0.0, 0.0, radius, radius, 0.0, 2.0 * Math.PI, false, 0.0);
        this.markerObject.add(CreateLineFromPoints(circleCurve.getPoints(50), material));

        const sphereGeo = new THREE.SphereGeometry(radius, 32, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const sphere = new THREE.Mesh(sphereGeo, sphereMaterial);
        this.markerObject.add(sphere)

        this.UpdatePosition(intersection);
    }

    UpdatePosition(intersection) {
        this.intersection = intersection;
        let faceNormal = GetFaceWorldNormal(this.intersection);
        this.markerObject.updateMatrixWorld(true);
        this.markerObject.position.set(0.0, 0.0, 0.0);
        this.markerObject.lookAt(faceNormal);
        this.markerObject.position.set(this.intersection.point.x, this.intersection.point.y, this.intersection.point.z);
    }

    Show(show) {
        this.markerObject.visible = show;
    }

    GetIntersection() {
        return this.intersection;
    }

    GetObject() {
        return this.markerObject;
    }
}

function CalculateMarkerValues(aMarker, bMarker) {
    const aIntersection = aMarker.GetIntersection();
    const bIntersection = bMarker.GetIntersection();
    let result = {
        pointsDistance: null,
        parallelFacesDistance: null,
        facesAngle: null
    };

    const aNormal = GetFaceWorldNormal(aIntersection);
    const bNormal = GetFaceWorldNormal(bIntersection);
    result.pointsDistance = aIntersection.point.distanceTo(bIntersection.point);
    result.facesAngle = aNormal.angleTo(bNormal);
    if (IsEqualEps(result.facesAngle, 0.0, BigEps) || IsEqualEps(result.facesAngle, Math.PI, BigEps)) {
        let aPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(aNormal, aIntersection.point);
        result.parallelFacesDistance = Math.abs(aPlane.distanceToPoint(bIntersection.point));
    }
    return result;
}

export class IdentificationTool {
    constructor(viewer, settings) {
        this.viewer = viewer;
        this.settings = settings;
        this.isActive = false;
        this.markers = [];
        this.tempMarker = null;

        this.panel = null;
        this.button = null;
    }

    SetButton(button) {
        this.button = button;
    }

    IsActive() {
        return this.isActive;
    }

    SetActive(isActive) {
        if (this.isActive === isActive) {
            return;
        }
        this.isActive = isActive;
        this.button.SetSelected(isActive);
        if (this.isActive) {
            this.panel = AddDiv(document.body, 'ov_identification_panel');
            this.UpdatePanel();
            this.Resize();
        } else {
            this.ClearMarkers();
            this.panel.remove();
        }
    }

    Click(mouseCoordinates) {
        let intersection = this.viewer.GetMeshIntersectionUnderMouse(mouseCoordinates);
        if (intersection === null) {
            this.ClearMarkers();
            this.UpdatePanel();
            return;
        }

        if (this.markers.length === 3) {
            // this.ClearMarkers();
            return
        }

        this.AddMarker(intersection);
        this.UpdatePanel();
    }

    MouseMove(mouseCoordinates) {
        let intersection = this.viewer.GetMeshIntersectionUnderMouse(mouseCoordinates);
        if (intersection === null) {
            if (this.tempMarker !== null) {
                this.tempMarker.Show(false);
                this.viewer.Render();
            }
            return;
        }
        if (this.tempMarker === null) {
            this.tempMarker = this.GenerateMarker(intersection);
        }
        this.tempMarker.UpdatePosition(intersection);
        this.tempMarker.Show(true);
        this.viewer.Render();
    }

    AddMarker(intersection) {
        let marker = this.GenerateMarker(intersection);
        this.markers.push(marker);
        if (this.markers.length === 2) {
            let material = CreateMaterial();
            let aPoint = this.markers[0].GetIntersection().point;
            let bPoint = this.markers[1].GetIntersection().point;
            this.viewer.AddExtraObject(CreateLineFromPoints([aPoint, bPoint], material));
        }
    }

    GenerateMarker(intersection) {
        let boundingSphere = this.viewer.GetBoundingSphere((meshUserData) => {
            return true;
        });

        let radius = boundingSphere.radius / 20.0;
        let marker = new Marker(intersection, radius);
        this.viewer.AddExtraObject(marker.GetObject());
        return marker;
    }

    UpdatePanel() {
        function BlendBackgroundWithPageBackground(backgroundColor) {
            let bodyStyle = window.getComputedStyle(document.body, null);
            let bgColors = bodyStyle.backgroundColor.match(/\d+/g);
            if (bgColors.length < 3) {
                return new RGBColor(backgroundColor.r, backgroundColor.g, backgroundColor.b);
            }
            let alpha = ColorComponentToFloat(backgroundColor.a);
            return new RGBColor(
                parseInt(bgColors[0], 10) * (1.0 - alpha) + backgroundColor.r * alpha,
                parseInt(bgColors[1], 10) * (1.0 - alpha) + backgroundColor.g * alpha,
                parseInt(bgColors[2], 10) * (1.0 - alpha) + backgroundColor.b * alpha
            );
        }

        function AddValue(panel, icon, title, value) {
            let svgIcon = AddSvgIconElement(panel, icon, 'left_inline');
            svgIcon.title = title;
            AddDiv(panel, 'ov_measure_value', value);
        }

        ClearDomElement(this.panel);
        if (this.settings.backgroundIsEnvMap) {
            this.panel.style.color = '#ffffff';
            this.panel.style.backgroundColor = 'rgba(0,0,0,0.5)';
        } else {
            let blendedColor = BlendBackgroundWithPageBackground(this.settings.backgroundColor);
            if (IsDarkTextNeededForColor(blendedColor)) {
                this.panel.style.color = '#000000';
            } else {
                this.panel.style.color = '#ffffff';
            }
            this.panel.style.backgroundColor = 'transparent';
        }
        if (this.markers.length === 0) {
            this.panel.innerHTML = 'Select 1st';
        } else if (this.markers.length === 1) {
            this.panel.innerHTML = 'Select 5th';
        } else if (this.markers.length === 2) {
            this.panel.innerHTML = 'Select heel';
        } else {
            this.panel.innerHTML = 'Check logs'
            console.log(this.markers)

            const sphereGeo = new THREE.SphereGeometry(0.5, 32, 16);
            const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
            const sphere = new THREE.Mesh(sphereGeo, sphereMaterial);
            this.viewer.AddExtraObject(sphere);

            const origin = new THREE.Vector3(0, 0, 0);
            const x = new THREE.Vector3(2, 0, 0);
            const y = new THREE.Vector3(0, 2, 0);
            const z = new THREE.Vector3(0, 0, 2);

            const redMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, depthTest: false });
            const greenMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false });
            const blueMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff, depthTest: false });

            this.viewer.AddExtraObject(CreateLineFromPoints([origin, x], redMaterial));
            this.viewer.AddExtraObject(CreateLineFromPoints([origin, y], greenMaterial));
            this.viewer.AddExtraObject(CreateLineFromPoints([origin, z], blueMaterial));

        }
        this.Resize();
    }

    Resize() {
        if (!this.isActive) {
            return;
        }
        let canvas = this.viewer.GetCanvas();
        let canvasRect = canvas.getBoundingClientRect();
        let panelRect = this.panel.getBoundingClientRect();
        let canvasWidth = canvasRect.right - canvasRect.left;
        let panelWidth = panelRect.right - panelRect.left;
        this.panel.style.left = (canvasRect.left + (canvasWidth - panelWidth) / 2) + 'px';
        this.panel.style.top = (canvasRect.top + 10) + 'px';
    }

    ClearMarkers() {
        this.viewer.ClearExtra();
        this.markers = [];
        this.tempMarker = null;
    }
}
