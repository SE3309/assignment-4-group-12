import * as Form from "@radix-ui/react-form";
import { useState } from "react";
import axios from "axios";

export function Register({ onRegisterSuccess }) {
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    try {
      const response = await axios.post("http://localhost:3000/register", {
        username: formData.get("username"),
        password: formData.get("password"),
        age: parseInt(formData.get("age")),
      });
      onRegisterSuccess();
    } catch (err) {
      setError(err.response?.data || "Registration failed");
    }
  };

  return (
    <Form.Root className="form-container" onSubmit={handleSubmit}>
      <h2>Register New Account</h2>

      <Form.Field name="username" className="form-field">
        <Form.Label>Username</Form.Label>
        <Form.Control type="text" required />
      </Form.Field>

      <Form.Field name="password" className="form-field">
        <Form.Label>Password</Form.Label>
        <Form.Control type="password" required />
      </Form.Field>

      <Form.Field name="age" className="form-field">
        <Form.Label>Age</Form.Label>
        <Form.Control type="number" required />
      </Form.Field>

      <Form.Submit className="submit-button">Create Account</Form.Submit>

      {error && <div className="error-message">{error}</div>}
    </Form.Root>
  );
}