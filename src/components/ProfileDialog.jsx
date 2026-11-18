import { useState } from "react";
import { Icon } from "./Icon.jsx";

export function ProfileDialog({ user, onSave, onClose }) {
  const [name, setName] = useState(user.name);
  const [farmName, setFarmName] = useState(user.farmName);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
      >
        <div className="modal-header">
          <h2 id="profile-title">Profile and farm</h2>
          <button
            className="icon-button"
            aria-label="Close profile"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave({ name, farmName });
          }}
        >
          <label>
            Full name
            <input
              required
              maxLength="120"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Farm or organization
            <input
              required
              maxLength="160"
              value={farmName}
              onChange={(event) => setFarmName(event.target.value)}
            />
          </label>
          <label>
            Email address
            <input disabled value={user.email} />
          </label>
          <button className="button button-primary">Save profile</button>
        </form>
      </section>
    </div>
  );
}
